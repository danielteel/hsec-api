const express = require('express');
const cors = require('cors');
const helmet = require("helmet");
const cookieparser = require("cookie-parser");
const { connect } = require('./database');
const {startupDeviceServer} = require('./deviceServer.js');

const { initAccessToken } = require('./common/accessToken');

const app = express();
app.set('trust proxy', true);

//Logging
if (process.env.NODE_ENV!=='test'){
    app.use((req, res, next) => {console.log(req.method, req.originalUrl, req.ip); next();});
}


if (!process.env.FORCE_SQLITE){
    app.use(cors({ origin: ['http://' + process.env.DOMAIN], credentials: true }));
}
app.use(helmet());
app.use(cookieparser());
app.use(express.json());

app.use('/user', require('./routes/user'));
app.use('/cam', require('./routes/cam'));
app.use('/manage', require('./routes/manage'));

const knexConfig = require('./knexfile')[process.env.FORCE_SQLITE ? 'test' : process.env.NODE_ENV || 'development'];

connect(knexConfig, async (knex) => {
    if (process.env.NODE_ENV !== 'test') console.log('database connected');

    if (await knex.migrate.currentVersion() === 'none') {
        await knex.migrate.latest();
        await knex.seed.run();
    }
    await initAccessToken(knex);
});

startupDeviceServer();

module.exports = { app };