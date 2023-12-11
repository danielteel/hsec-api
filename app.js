const express = require('express');
const cors = require('cors');
const helmet = require("helmet");
const cookieparser = require("cookie-parser");
const { connect } = require('./database');

const domain = require('./config/domain');
const { initAccessToken, authenticate } = require('./common/accessToken');


let forceSqlite = false;
for (const a of process.argv) {
    if (a.toLowerCase().trim() === '-sqlite') {
        forceSqlite = true;
    }
}
const knexConfig = require('./config/knex-configs')[forceSqlite ? 'test' : process.env.NODE_ENV || 'development'];



const app = express();
app.use(cors({ origin: 'http://' + domain, credentials: true }));
app.use(helmet());
app.use(cookieparser());
app.use(express.json());

if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        console.log(req.method, req.originalUrl, req.ip);
        next();
    });

    require('dotenv').config({ path: '../gitpush.env' })
    const { execSync, spawn } = require('node:child_process');

    app.post('/gitpush/:secret', async (req, res) => {
        if (req.params.secret === process.env.GITPUSH_SECRET) {
            execSync('git pull');
            execSync('npm install');
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    });

    app.get('/cam/:file', authenticate, (req, res) => {
        if (req.body.user.permissions.view){
            res.sendFile('/mnt/ramdisk/' + req.params.file);
        }else{
            res.sendStatus(403);
        }
    });

    (()=>{
        const args = [
            '-i', '/dev/video0',
            '-s', '960x540',
            '-r', '4',
            '-g', '5',
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-hls_time', '1.25',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments',
            '/mnt/ramdisk/allcamL.m3u8',
        ]
        const child = spawn('ffmpeg', args);
        console.log('ffmpeg started')
        child.on('exit', (code) => {
            console.log(`ffmpeg process exited with code ${code}`);
        });
        child.stderr.on('data', (data) => null);
        child.stdout.on('data', (data) => null);
    })();
}

app.use('/user', require('./routes/user'));



connect(knexConfig, async (knex) => {
    if (process.env.NODE_ENV !== 'test') console.log('database connected', knexConfig);

    if (await knex.migrate.currentVersion() === 'none') {
        await knex.migrate.latest();
        await knex.seed.run();
    }

    await initAccessToken(knex);
});


module.exports = { app };