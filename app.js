const express = require('express');
const cors = require('cors');
const helmet = require("helmet");
const cookieparser = require("cookie-parser");
const { connect } = require('./database');

const domain = require('./config/domain');
const { initAccessToken } = require('./common/accessToken');


const app = express();
app.use(cors({ origin: 'http://' + domain, credentials: true }));
app.use(helmet());
app.use(cookieparser());
app.use(express.json());


app.use('/api/user', require('./routes/user'));
app.use('/cam', require('./routes/cam'));


let forceSqlite = false;
for (const a of process.argv) {
    if (a.toLowerCase().trim() === '-sqlite') {
        forceSqlite = true;
    }
}
const knexConfig = require('./config/knex-configs')[forceSqlite ? 'test' : process.env.NODE_ENV || 'development'];

connect(knexConfig, async (knex) => {
    if (process.env.NODE_ENV !== 'test') console.log('database connected', knexConfig);

    if (await knex.migrate.currentVersion() === 'none') {
        await knex.migrate.latest();
        await knex.seed.run();
    }

    await initAccessToken(knex);
});


module.exports = { app };