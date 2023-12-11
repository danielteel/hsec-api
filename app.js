const express = require('express');
const cors=require('cors');
const helmet = require("helmet");
const cookieparser = require("cookie-parser");
const {connect}=require('./database');

const domain = require('./config/domain');

let forceSqlite=false;
for (const a of process.argv){
    if (a.toLowerCase().trim()==='-sqlite'){
        forceSqlite=true;
    }
}

const knexConfig = require('./config/knex-configs')[forceSqlite ? 'test' : process.env.NODE_ENV || 'development'];

const {initAccessToken} = require('./common/accessToken');


const app = express();
app.use(cors({origin: 'http://'+domain, credentials: true}));
app.use(helmet());
app.use(cookieparser());
app.use(express.json());

if (process.env.NODE_ENV!=='test'){
    app.use((req, res, next)=>{
        console.log(req.method, req.originalUrl, req.ip);
        next();
    });

    require('dotenv').config({path: '../gitpush.env'})
    app.post('/gitpush/:secret', async (req, res) => {
        const { execSync } = require('node:child_process');
        if (req.params.secret===process.env.GITPUSH_SECRET){
            execSync('git pull');
            execSync('npm install');
            res.sendStatus(200);
        }else{
            res.sendStatus(404);
        }
    });
}

app.use('/user', require('./routes/user'));



connect(knexConfig, async (knex)=>{
    if (process.env.NODE_ENV!=='test') console.log('database connected', knexConfig);

    if (await knex.migrate.currentVersion()==='none'){
        await knex.migrate.latest();
        await knex.seed.run();
    }
    
    await initAccessToken(knex);
});


module.exports = {app};