const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const {getImageLibrary}=require('../deviceServer');

const router = express.Router();
module.exports = router;


router.get('/garage', (req, res) => {
    try {
        const imageLibrary=getImageLibrary();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache, no-transform, no-store, must-revalidate');
        res.send(imageLibrary['Garage']);
    } catch (e){
        console.error('ERROR /cam/:file', req.body, e);
        res.status(400).json({error: 'error'});
    }
});