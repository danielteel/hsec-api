const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const fetch = require('node-fetch');

const {activeDevices}=require('../deviceServer');

const router = express.Router();
module.exports = router;


router.get('/garage', (req, res) => {
    try {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache, no-transform, no-store, must-revalidate');
        res.send(activeDevices[0].cachedImage);
    } catch (e){
        console.error('ERROR /cam/:file', req.body, e);
        res.status(400).json({error: 'error'});
    }
});