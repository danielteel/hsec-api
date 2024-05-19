const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword, isHexadecimal} = require('../common/common');
const fetch = require('node-fetch');

const {DeviceIO}=require('../deviceServer');

const router = express.Router();
module.exports = router;

async function getAndValidateDevices(knex, userRole){
    let devices;
    if (userRole==='admin' || userRole==='super'){
        devices = await knex('devices').select(['id as device_id', 'name', 'encro_key']);
    }else{
        devices = await knex('devices').select(['id as device_id', 'name']);
    }
    const connectedDevices=DeviceIO.getDevices();
    for (const connectedDevice of connectedDevices){
        let isValid=false;
        for (const device of devices){
            if (connectedDevice.name===device.name){
                isValid=true;
                device.connected=true;
                if (connectedDevice.actions){
                    device.actions=connectedDevice.actions;
                }
                break;
            }
        }
        if (!isValid){
            connectedDevice.onDeviceDatabaseDelete();
        }
    }
    return devices;
}

router.get('/list', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR GET /devices/list', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/add', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const fields = [
            'name:string:*:t',
            'encro_key:string:*:t'
        ]
        let [fieldCheck, name, encro_key] = verifyFields(req.body, fields);
        if (!fieldCheck){
            if (name==='') fieldCheck+='name cannot be empty. ';
            if (typeof encro_key==='string' && encro_key.length!=64) fieldCheck+='encro_key length needs to be 64 hexadecimal characters. ';
            if (!isHexadecimal(encro_key)) fieldCheck+='encro_key needs to be hexadecimal character. ';
        }
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const deviceExists = await req.knex('devices').select(['name']).where('name', name);
        if (deviceExists.length) return res.status(400).json({error: 'device with name '+name+' already exists'});

        await req.knex('devices').insert({name, encro_key});

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/add', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/update', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const fields = [
            'device_id:number',
            'name:string:*:t',
            'encro_key:string:*:t'
        ]
        let [fieldCheck, device_id, name, encro_key] = verifyFields(req.body, fields);
        if (!fieldCheck){
            if (name==='') fieldCheck+='name cannot be empty. ';
            if (typeof encro_key==='string' && encro_key.length!=64) fieldCheck+='encro_key length needs to be 64 hexadecimal characters. ';
            if (!isHexadecimal(encro_key)) fieldCheck+='encro_key needs to be hexadecimal character. ';
        }
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const deviceExists = await req.knex('devices').select(['name']).where('name', name);
        if (deviceExists.length) return res.status(400).json({error: 'device with name '+name+' already exists'});

        await req.knex('devices').update({name, encro_key}).where({id: device_id});

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/update', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/delete', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const [fieldCheck, device_id] = verifyFields(req.body, ['device_id:number']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        
        const deviceExists = await req.knex('devices').select(['id']).where('id', device_id);
        if (!deviceExists.length) return res.status(400).json({error: 'device with id '+device_id+' doesnt exist'});

        await req.knex('devices').where({id: device_id}).delete();

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/delete', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});


router.post('/action', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        return res.status(200).end();
    }catch(e){
        console.error('ERROR POST /devices/action', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});