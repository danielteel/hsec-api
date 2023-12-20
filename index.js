for (const a of process.argv) {
        if (a.toLowerCase().trim() === '-sqlite') process.env.FORCE_SQLITE=true;
}

const {app} = require('./app.js');


const port = 4001;


const server = app.listen(port, () => {
        console.log('listening on '+port)
});