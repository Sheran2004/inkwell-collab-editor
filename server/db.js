const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
});
const DEFAULT_DELTA = { ops: [{ insert: "\n" }] };
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY, title VARCHAR(120) NOT NULL DEFAULT 'Untitled document',
    data JSONB NOT NULL DEFAULT '${JSON.stringify(DEFAULT_DELTA)}'::jsonb,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, share_token TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS documents_user_updated_idx ON documents(user_id, updated_at DESC)`);
  console.log("PostgreSQL ready");
}
async function createUser({name,email,passwordHash}) {
  const {rows}=await pool.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,created_at AS "createdAt"',[name,email,passwordHash]); return rows[0];
}
async function findUserByEmail(email) { const {rows}=await pool.query('SELECT id,name,email,password_hash FROM users WHERE email=$1',[email]); return rows[0]||null; }
async function getUserById(id) { const {rows}=await pool.query('SELECT id,name,email,created_at AS "createdAt" FROM users WHERE id=$1',[id]); return rows[0]||null; }
async function listDocuments(userId) { const {rows}=await pool.query('SELECT id AS "_id",title,created_at AS "createdAt",updated_at AS "updatedAt" FROM documents WHERE user_id=$1 ORDER BY updated_at DESC',[userId]); return rows; }
async function createDocument(title,userId) { const {rows}=await pool.query('INSERT INTO documents(title,data,user_id) VALUES($1,$2,$3) RETURNING id AS "_id",title,created_at AS "createdAt",updated_at AS "updatedAt"',[title||'Untitled document',DEFAULT_DELTA,userId]); return rows[0]; }
async function getDocument(id,userId,shareToken) { const {rows}=await pool.query('SELECT id,title,data,user_id,share_token FROM documents WHERE id=$1 AND (user_id=$2 OR ($3::text IS NOT NULL AND share_token=$3))',[id,userId,shareToken||null]); return rows[0]||null; }
async function createShareToken(id,userId,token) { const {rows}=await pool.query('UPDATE documents SET share_token=$1 WHERE id=$2 AND user_id=$3 RETURNING share_token',[token,id,userId]); return rows[0]||null; }
async function revokeShareToken(id,userId) { const {rows}=await pool.query('UPDATE documents SET share_token=NULL WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]); return rows[0]||null; }
async function updateDocumentData(id,userId,data,shareToken) { const {rowCount}=await pool.query('UPDATE documents SET data=$1,updated_at=now() WHERE id=$2 AND (user_id=$3 OR ($4::text IS NOT NULL AND share_token=$4))',[JSON.stringify(data),id,userId,shareToken||null]); return rowCount>0; }
async function updateDocumentTitle(id,userId,title,shareToken) { const {rows}=await pool.query('UPDATE documents SET title=$1,updated_at=now() WHERE id=$2 AND (user_id=$3 OR ($4::text IS NOT NULL AND share_token=$4)) RETURNING id AS "_id",title,updated_at AS "updatedAt"',[title||'Untitled document',id,userId,shareToken||null]); return rows[0]||null; }
async function deleteDocument(id,userId) { const {rowCount}=await pool.query('DELETE FROM documents WHERE id=$1 AND user_id=$2',[id,userId]); return rowCount>0; }
module.exports={init,createUser,findUserByEmail,getUserById,listDocuments,createDocument,getDocument,createShareToken,revokeShareToken,updateDocumentData,updateDocumentTitle,deleteDocument};
