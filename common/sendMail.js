require('dotenv').config({ path: '../email.env' });
const nodemailer = require("nodemailer");

let transporter = null;

function sendMail(to, subject, text, html){
    if (!transporter){
        transporter=nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT),
            secure: Number(process.env.EMAIL_PORT)===465?true:false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }
    return transporter.sendMail({
        from: `<${process.env.EMAIL_USER}>`,
        to: to, 
        subject,
        text,
        html,
    });
}

module.exports = sendMail;