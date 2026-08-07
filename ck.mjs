import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`SELECT model,status,"outputUrl",LEFT(error,90) err FROM "Generation" WHERE id='cmsfzecjj0000nrkt8gjerxfo'`);
console.log("MUSIC:", JSON.stringify(r.rows[0]));
await c.end();
