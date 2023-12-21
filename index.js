for (const a of process.argv) {
        if (a.toLowerCase().trim() === '-sqlite') process.env.FORCE_SQLITE=true;
}

const {app} = require('./app.js');


app.listen(process.env.API_PORT, () => {
        console.log('listening on '+process.env.API_PORT)
});