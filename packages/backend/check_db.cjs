const { Client } = require('pg');
const config = require('./.config/default.yml'); // This might not work if it's YAML and not parsed.
// Actually, let's try to load ormconfig or just use psql if available.
// I'll try to use the TypeORM connection from the app if possible, or just a raw pg connection if I can guess the credentials.
// Misskey usually has a .config/default.yml.
// I'll try to read .config/default.yml first to get DB creds.

const fs = require('fs');
const yaml = require('js-yaml');

async function check() {
    try {
        const content = fs.readFileSync('../../.config/default.yml', 'utf8');
        const cfg = yaml.load(content);

        const client = new Client({
            user: cfg.db.user,
            host: cfg.db.host,
            database: cfg.db.db,
            password: cfg.db.pass,
            port: cfg.db.port,
        });

        await client.connect();

        const res = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'meta' AND column_name = 'maxHelpPackagesPerUser';
        `);

        console.log('Columns found:', res.rows);

        await client.end();
    } catch (e) {
        console.error(e);
    }
}

check();
