const {randomUUID, generateKeyPairSync, constants, privateEncrypt, publicDecrypt} = require('crypto');
const {getKnex} = require('../database');
const {getHash} = require('./common');

let accessToken = null;

function getNewKeys(){
    const passphrase = randomUUID();
    const publicKeyEncoding={
        type: 'spki',
        format: 'pem'
    }

    const privateKeyEncoding={
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: passphrase
    }

    const keys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding,
        privateKeyEncoding
    });

    keys.passphrase = passphrase;
    keys.crypto_id = 'access_token';
    return keys;
}

async function initAccessToken(knex, forceNew=false){
    try {
        const [existingRecord] = await knex('crypto').select(['*']).where({crypto_id: 'access_token'})
        if (existingRecord) hasExisting = true;
        if (forceNew && existingRecord){
            await knex('crypto').delete().where({crypto_id: 'access_token'});
        }else if (existingRecord){
            accessToken=existingRecord;
            return;
        }

        let newKeys = getNewKeys();
        await knex('crypto').insert([newKeys]);
        const [accessTokenRecord] = await knex('crypto').select(['*']).where({crypto_id: 'access_token'});
        if (!accessTokenRecord){
            throw Error("Unable to generate and store access keys");
        }
        accessToken=accessTokenRecord;
    } catch (e) {
        console.error('unable to generate and store access keys', e)
    }
}


function generateAccessToken(data){
    data=JSON.stringify(data);
    return privateEncrypt(
        {
            key: accessToken.privateKey,
            passphrase: accessToken.passphrase,
            padding:constants.RSA_PKCS1_PADDING
        },
        Buffer.from(data)
    ).toString('base64');
}

function decryptAccessToken(data){
    try {
        return JSON.parse(
            publicDecrypt({
                key: accessToken.publicKey,
                padding:constants.RSA_PKCS1_PADDING
            }, Buffer.from(data, 'base64')).toString()
        );
    } catch (e) {
        return null;
    }
}

async function getUserFromToken(token){
    const knex=getKnex();
    const [user] = await knex('users').select('users.id', 'users.email', 'roles.admin', 'roles.manage', 'roles.view').leftJoin('roles', 'users.role_id', 'roles.id').where({'users.id': token.id, session: token.session});;
    if (user){
        return user;
    }
    return null;
}


async function authenticate(req, res, next){
    if (req.body.user) req.body.user=null;
    const accessToken = decryptAccessToken(req.cookies['accessToken']);
    if (accessToken){
        if (getHash(accessToken.hashcess) === req.cookies['hashcess']){
            const user=await getUserFromToken(accessToken);
            if (user){
                req.body.user=user;
                return next();
            }
        }else{
            res.clearCookie('accessToken', {
                httpOnly: true,
                sameSite: 'lax',
                secure: true,
                domain: 'localhost'
            });
            res.clearCookie('hashcess', {
                sameSite: 'lax',
                secure: true,
                domain: 'localhost'
            });
        }
    }
    return res.status(401).json('log in');
}


module.exports = {initAccessToken, generateAccessToken, decryptAccessToken, authenticate, getUserFromToken};