const {generateKeyPairSync, constants, privateEncrypt, publicDecrypt} = require('crypto');
const {getKnex} = require('../database');
const {getHash, generateVerificationCode} = require('./common');

let accessToken = null;

function getNewKeys(){
    const publicKeyEncoding={
        type: 'spki',
        format: 'pem'
    }

    const privateKeyEncoding={
        type: 'pkcs8',
        format: 'pem',
    }

    const keys = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding,
        privateKeyEncoding
    });

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
            padding: constants.RSA_PKCS1_PADDING
        },
        Buffer.from(data)
    ).toString('base64');
}

function decryptAccessToken(data){
    try {
        return JSON.parse(
            publicDecrypt({
                key: accessToken.publicKey,
                padding: constants.RSA_PKCS1_PADDING
            }, Buffer.from(data, 'base64')).toString()
        );
    } catch (e) {
        return null;
    }
}

function isHigherRanked(a, b){
    const roles = ['unverified', 'member', 'manager', 'admin', 'super'];
    const aRank = roles.indexOf(a.trim().toLowerCase());
    const bRank = roles.indexOf(b.trim().toLowerCase());

    if (aRank===-1 || bRank===-1){
        throw Error('isHigherRanked: invalid role on either '+a+' or '+b);
    }
    if (aRank>bRank) return true;
    return false;
}

function setAccessCookies(res, user, remember=false){
    const hashcess = generateVerificationCode();
    const accessToken = generateAccessToken({id: user.id, session: user.session, hashcess});

    let maxAgeObj = {};
    if (remember){
        maxAgeObj={maxAge: 31536000000};
    }

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        domain: process.env.DOMAIN,
        ...maxAgeObj
    });
    res.cookie('hashcess', getHash(hashcess), {
        sameSite: 'lax',
        secure: true,
        domain: process.env.DOMAIN,
        ...maxAgeObj
    });
}

async function getUserFromToken(token){
    const knex=getKnex();
    const [user] = await knex('users').select('id', 'email', 'role').where({id: token.id, session: token.session});;
    if (user){
        return {id: user.id, email: user.email, role: user.role};
    }
    return null;
}

async function authenticate(minRole, req, res, next){
    try {
        if (! ['super', 'admin', 'manager', 'member', 'unverified'].includes(minRole)){
            throw Error('unknown min role '+minRole+', expected either super admin manager member unverified');
        }
        if (req.user) req.user=null;
        const accessToken = decryptAccessToken(req.cookies['accessToken']);
        if (accessToken){
            if (getHash(accessToken.hashcess) === req.cookies['hashcess']){
                const user=await getUserFromToken(accessToken);
                if (user){
                    let notAllowed=false;
                    notAllowed ||= minRole==='super' && user.role!=='super';
                    notAllowed ||= minRole==='admin' && !['super', 'admin'].includes(user.role);
                    notAllowed ||= minRole==='manager' && !['super', 'admin', 'manager'].includes(user.role);
                    notAllowed ||= minRole==='member' && !['super', 'admin', 'manager', 'member'].includes(user.role);
                    notAllowed ||= minRole==='unverified' && !['super', 'admin', 'manager', 'member', 'unverified'].includes(user.role);
                    if (notAllowed){
                        return res.status(403).json({error: 'insufficient privileges'});
                    }
                    req.user=user;
                    return next();
                }
            }else{
                res.clearCookie('accessToken', {
                    httpOnly: true,
                    sameSite: 'lax',
                    secure: true,
                    domain: process.env.DOMAIN
                });
                res.clearCookie('hashcess', {
                    sameSite: 'lax',
                    secure: true,
                    domain: process.env.DOMAIN
                });
            }
        }
        return res.status(401).json({error: 'log in'});
    }catch (e){
        console.error('ERROR authenticate', e);
        return res.status(400).json({error: 'failed'});
    }
}


module.exports = {initAccessToken, generateAccessToken, decryptAccessToken, authenticate, getUserFromToken, isHigherRanked, setAccessCookies};