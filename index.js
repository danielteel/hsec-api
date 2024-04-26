const apiPort = process.env.API_PORT || 4001;

for (const a of process.argv) {
        if (a.toLowerCase().trim() === '-sqlite') process.env.FORCE_SQLITE=true;
}

const {app} = require('./app.js');


app.listen(apiPort, () => {
        console.log('listening on '+apiPort)
});