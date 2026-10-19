require("dotenv").config();

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Server } = require("socket.io");
const db = require("./db");

const app = express();
const server = http.createServer(app);

const production = process.env.NODE_ENV === "production";
const allowedOrigin = process.env.CLIENT_ORIGIN;
const PORT = process.env.PORT || 4000;
const COOKIE = "inkwell_session";
const secret = process.env.AUTH_SECRET;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// ---------------- SECURITY HEADERS & CORS ----------------

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");

  if (allowedOrigin && req.headers.origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  next();
});

// ---------------- SOCKET.IO ----------------

const io = new Server(server, {
  cors: {
    origin: allowedOrigin || false,
    credentials: true,
  },
});

// ---------------- ENVIRONMENT VALIDATION ----------------

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
}

if (!secret || secret.length < 32) {
  console.error("AUTH_SECRET must be at least 32 characters long.");
}

// ---------------- SESSION TOKEN ----------------

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verify(token) {
  try {
    const [body, signature] = token.split(".");

    if (!body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest();

    const actual = Buffer.from(signature, "base64url");

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString()
    );

    if (!payload.exp || payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ---------------- COOKIE HELPERS ----------------

function cookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");

        return [
          part.slice(0, index),
          decodeURIComponent(part.slice(index + 1)),
        ];
      })
  );
}

function setSession(res, user) {
  const token = sign({
    sub: String(user.id),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  });

  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${
      production ? "; Secure" : ""
    }`
  );
}

function clearSession(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      production ? "; Secure" : ""
    }`
  );
}

// ---------------- AUTHENTICATION MIDDLEWARE ----------------

async function auth(req, res, next) {
  try {
    const token = cookies(req.headers.cookie || "")[COOKIE] || "";
    const payload = verify(token);

    if (!payload) {
      return res.status(401).json({
        error: "Please sign in to continue.",
      });
    }

    const user = await db.getUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        error: "Session expired. Please sign in again.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error.message);

    return res.status(500).json({
      error: "Could not verify your session.",
    });
  }
}

// ---------------- PASSWORD HELPERS ----------------

function hashWithSalt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      (error, key) => {
        if (error) reject(error);
        else resolve(key.toString("hex"));
      }
    );
  });
}

async function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  return `${salt}:${await hashWithSalt(password, salt)}`;
}

async function passwordMatches(password, record) {
  try {
    const [salt, hash] = record.split(":");

    if (!salt || !hash) return false;

    const actual = Buffer.from(
      await hashWithSalt(password, salt),
      "hex"
    );

    const expected = Buffer.from(hash, "hex");

    return (
      actual.length === expected.length &&
      crypto.timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

// ---------------- HEALTH CHECK ----------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "inkwell-api",
  });
});

// ---------------- SIGNUP ----------------

app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 80);
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({
        error: "Enter your name (at least 2 characters).",
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "Password must be 8 to 128 characters long.",
      });
    }

    const user = await db.createUser({
      name,
      email,
      passwordHash: await passwordRecord(password),
    });

    setSession(res, user);

    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "Could not create your account.",
    });
  }
});

// ---------------- LOGIN ----------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await db.findUserByEmail(email);

    if (
      !user ||
      !(await passwordMatches(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Email or password is incorrect.",
      });
    }

    setSession(res, user);
    delete user.password_hash;

    return res.json({ user });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not sign you in.",
    });
  }
});

// ---------------- CURRENT USER ----------------

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// ---------------- LOGOUT ----------------

app.post("/api/auth/logout", (req, res) => {
  clearSession(res);
  res.status(204).end();
});

// ---------------- LIST DOCUMENTS ----------------

app.get("/api/documents", auth, async (req, res) => {
  try {
    return res.json(await db.listDocuments(req.user.id));
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not load documents.",
    });
  }
});

// ---------------- CREATE DOCUMENT ----------------

app.post("/api/documents", auth, async (req, res) => {
  try {
    const title =
      String(req.body.title || "Untitled document").trim().slice(0, 120) ||
      "Untitled document";

    return res.status(201).json(
      await db.createDocument(title, req.user.id)
    );
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not create the document.",
    });
  }
});

// ---------------- UPDATE DOCUMENT TITLE ----------------

app.patch("/api/documents/:id/title", auth, async (req, res) => {
  try {
    const title =
      String(req.body.title || "Untitled document").trim().slice(0, 120) ||
      "Untitled document";

    const doc = await db.updateDocumentTitle(
      req.params.id,
      req.user.id,
      title
    );

    if (!doc) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.json(doc);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not rename the document.",
    });
  }
});

// ---------------- CREATE SHARE LINK ----------------

app.post("/api/documents/:id/share", auth, async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString("base64url");

    const result = await db.createShareToken(
      req.params.id,
      req.user.id,
      token
    );

    if (!result) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.json({ token });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not create a share link.",
    });
  }
});

// ---------------- REVOKE SHARE LINK ----------------

app.delete("/api/documents/:id/share", auth, async (req, res) => {
  try {
    const result = await db.revokeShareToken(
      req.params.id,
      req.user.id
    );

    if (!result) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.status(204).end();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not disable the share link.",
    });
  }
});

// ---------------- DELETE DOCUMENT ----------------

app.delete("/api/documents/:id", auth, async (req, res) => {
  try {
    const deleted = await db.deleteDocument(
      req.params.id,
      req.user.id
    );

    if (!deleted) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.status(204).end();
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not delete the document.",
    });
  }
});

// ---------------- ACTIVE VIEWERS ----------------

const activeViewers = new Map();

// ---------------- SOCKET AUTHENTICATION ----------------

io.use(async (socket, next) => {
  try {
    const token =
      cookies(socket.handshake.headers.cookie || "")[COOKIE];

    const payload = verify(token || "");

    if (!payload) {
      return next(new Error("Authentication required"));
    }

    const user = await db.getUserById(payload.sub);

    if (!user) {
      return next(new Error("Authentication required"));
    }

    socket.data.user = user;

    return next();
  } catch {
    return next(new Error("Authentication required"));
  }
});

// ---------------- SOCKET CONNECTION ----------------

io.on("connection", (socket) => {
  let joinedDoc = null;
  let joinedShareToken = null;

  // Leave the current document safely.
  const leaveDocument = () => {
    if (!joinedDoc) return;

    const viewers = activeViewers.get(joinedDoc);

    viewers?.delete(socket.id);

    io.to(String(joinedDoc)).emit(
      "viewers-update",
      viewers?.size || 0
    );

    if (viewers && viewers.size === 0) {
      activeViewers.delete(joinedDoc);
    }

    socket.leave(String(joinedDoc));

    joinedDoc = null;
    joinedShareToken = null;
  };

  // ---------------- LOAD DOCUMENT ----------------

  socket.on("get-document", async (request) => {
    leaveDocument();

    const id =
      typeof request === "object" ? request?.id : request;

    const shareToken =
      typeof request === "object"
        ? String(request?.shareToken || "")
        : "";

    try {
      const doc = await db.getDocument(
        id,
        socket.data.user.id,
        shareToken
      );

      if (!doc) {
        socket.emit(
          "document-error",
          "Document not found, or you do not have access."
        );
        return;
      }

      joinedDoc = String(id);

      joinedShareToken =
        String(doc.user_id) === String(socket.data.user.id)
          ? null
          : shareToken;

      socket.join(joinedDoc);

      if (!activeViewers.has(joinedDoc)) {
        activeViewers.set(joinedDoc, new Set());
      }

      activeViewers.get(joinedDoc).add(socket.id);

      socket.emit("load-document", {
        data: doc.data,
        title: doc.title,
      });

      io.to(joinedDoc).emit(
        "viewers-update",
        activeViewers.get(joinedDoc).size
      );
    } catch (error) {
      console.error("Document load failed:", error);

      socket.emit(
        "document-error",
        "Could not load this document."
      );
    }
  });

  // ---------------- REAL-TIME EDITING ----------------

  socket.on("send-changes", (delta) => {
    if (
      joinedDoc &&
      delta &&
      Array.isArray(delta.ops)
    ) {
      socket.broadcast
        .to(joinedDoc)
        .emit("receive-changes", delta);
    }
  });

  // ---------------- AUTOSAVE ----------------

  socket.on("save-document", async (data, callback) => {
  try {
    if (!joinedDoc) {
      socket.emit("save-error", "No document is currently open.");
      if (typeof callback === "function") {
        callback({ success: false, error: "No document is open." });
      }
      return;
    }

    const saved = await db.updateDocumentData(
      joinedDoc,
      socket.data.user.id,
      data,
      joinedShareToken
    );

    if (!saved) {
      socket.emit("save-error", "Document was not saved. Check document access.");
      if (typeof callback === "function") {
        callback({ success: false, error: "Document was not saved." });
      }
      return;
    }

    socket.emit("save-success");

    if (typeof callback === "function") {
      callback({ success: true });
    }
  } catch (error) {
    console.error("Autosave failed:", error);

    socket.emit("save-error", "Database save failed.");

    if (typeof callback === "function") {
      callback({ success: false, error: "Database save failed." });
    }
  }
});

  // ---------------- TITLE CHANGES ----------------

  socket.on("title-change", async (rawTitle) => {
    if (!joinedDoc) return;

    const safeTitle =
      String(rawTitle || "").trim().slice(0, 120) ||
      "Untitled document";

    try {
      const doc = await db.updateDocumentTitle(
        joinedDoc,
        socket.data.user.id,
        safeTitle,
        joinedShareToken
      );

      if (!doc) {
        socket.emit(
          "document-error",
          "Document not found, or you do not have access."
        );
        return;
      }

      io.to(joinedDoc).emit(
        "title-update",
        safeTitle
      );
    } catch (error) {
      console.error(
        "Title update failed:",
        error
      );

      socket.emit(
        "save-error",
        "Could not update the document title."
      );
    }
  });

  // ---------------- DISCONNECT ----------------

  socket.on("disconnect", leaveDocument);
});

// ---------------- SERVE FRONTEND ----------------

app.use(
  express.static(
    path.join(__dirname, "../client/dist"),
    { index: false }
  )
);

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "API route not found.",
    });
  }

  return res.sendFile(
    path.join(__dirname, "../client/dist/index.html")
  );
});

// ---------------- START SERVER ----------------

(async () => {
  try {
    if (
      !process.env.DATABASE_URL ||
      !secret ||
      secret.length < 32
    ) {
      throw new Error(
        "Set DATABASE_URL and AUTH_SECRET (32+ characters) before starting."
      );
    }

    await db.init();

    server.listen(PORT, () => {
      console.log(`Inkwell listening on port ${PORT}`);
    });
  } catch (error) {
    console.error(
      "Startup failed:",
      error.message
    );

    process.exit(1);
  }
})();