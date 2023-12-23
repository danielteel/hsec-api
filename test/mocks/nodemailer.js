//mock nodemailer
const nodemailer = require("nodemailer");

const mockNodemailer = {
    clear: () => {
        mockNodemailer.sent=[];
        mockNodemailer.htmlSent=[];
    },
    sent: [],
}


nodemailer.createTransport = (...args) => {
    return {
        sendMail: (data, callback) => {
            mockNodemailer.sent.push(data);
            if (callback){
                callback();
            }else{
                return new Promise( (resolve, reject) => {
                    resolve({info: {}});
                });
            }
        }
    };
}

module.exports = {mockNodemailer};