const express = require('express');
const { getKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword} = require('../common/common');
const {generateAccessToken, authenticate} = require('../common/accessToken');
const sendMail = require('../common/sendMail');


const router = express.Router();
module.exports = router;




router.post('/passwordchange', async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";

        const [fieldCheck, email, newPassword, confirmCode] = verifyFields(req.body, ['email:string:*:lt', 'newPassword:string:?', 'confirmCode:string:?:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})
        const newPassHash=getHash(newPassword);


        const [user] = await knex('users').select('*').where({email});

        if (user){
            const [changePasswordRecord] = await knex('user_changepassword').select('*').where({user_id: user.id});
            if (changePasswordRecord && newPassHash && confirmCode===changePasswordRecord.confirmation_code){//User is changing password now  
                const passwordCheck = isLegalPassword(newPassword);
                if (passwordCheck){
                    return res.status(400).json({error: 'password is not legal. '+passwordCheck});
                }else{
                    await knex('user_changepassword').delete().where({user_id: user.id});//delete existing changepassword record
                    await knex('users').update({pass_hash: newPassHash}).where({id: user.id});//update pass_hash with new
                    
                    return res.status(201).json({message: 'success'});
                }
            }else{
                if (changePasswordRecord) await knex('user_changepassword').delete().where({user_id: user.id});//delete existing changepassword record
                const confirmationCode =  generateVerificationCode();
                await knex('user_changepassword').insert([{user_id: user.id, confirmation_code: confirmationCode}]);//add new changepassword record
                sendMail(email, "Password change", "A password reset request was sent for this email address, use the following confirmation code to reset it. "+confirmationCode);
                
                return res.status(200).json({message: 'check email'});
            }
        }

        //User wasnt found, but give back the same response as if there was one found so its harded to poke around finding emails
        return res.status(200).json({message: 'check email'});
    } catch (e) {
        console.error('ERROR /passwordchange', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});

//get change email status
router.post('/getchangeemail', authenticate, async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";

        const [fieldCheck, user] = verifyFields(req.body, ['user:any']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        const [changeEmailRecord] = await knex('user_changeemail').select('*').where({user_id: user.id});
        if (changeEmailRecord){
            if (changeEmailRecord.step==='verifyOld'){
                return res.status(200).json({status: 'verifyOld'});
            }else if (changeEmailRecord.step==='verifyNew'){
                return res.status(200).json({status: 'verifyNew'});
            }
        }
        return res.status(200).json({status: 'nochange'});
    } catch (e) {
        console.error('ERROR /getchangeemail', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});

//change email
router.post('/changeemail', authenticate, async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";

        const [fieldCheck, user, newEmail, verifyCode] = verifyFields(req.body, ['user:any', 'newEmail:string:?:lt', 'verifyCode:string:?:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        if (newEmail){//passing in newEmail means you want to start the process of changing emails
            await knex('user_changeemail').delete().where({user_id: user.id});//delete old change email record if it exists

            const newVerifyCode = generateVerificationCode();
            await knex('user_changeemail').insert([{user_id: user.id, new_email: newEmail, current_verification_code: newVerifyCode, new_email: newEmail, step: 'verifyOld'}]);

            sendMail(user.email, 'Verify change email', 'Change email request recieved, code to verify current email before changing is '+newVerifyCode);
            return res.status(200).json({message: 'verify current email'});

        }else{//newEmail wasnt passed, we must be on the verify steps
            const [changeEmailRecord] = await knex('user_changeemail').select('*').where({user_id: user.id});
            if (changeEmailRecord){
                if (verifyCode === changeEmailRecord.current_verification_code){
                    if (changeEmailRecord.step==='verifyOld'){
                        const newVerifyCode = generateVerificationCode();
                        await knex('user_changeemail').update({current_verification_code: newVerifyCode, step: 'verifyNew'}).where({id: changeEmailRecord.id});

                        sendMail(changeEmailRecord.new_email, 'Verify change email', 'Change email request recieved, code to verify new email before changing is '+newVerifyCode);
                        return res.status(200).json({message: 'verify new email'});
                    }else if (changeEmailRecord.step==='verifyNew'){
                        await knex('users').update({email: changeEmailRecord.new_email}).where({id: changeEmailRecord.user_id});
                        await knex('user_changeemail').delete().where({user_id: user.id});//delete change email record if it exists
                        return res.status(201).json({accessToken: generateAccessToken({email: changeEmailRecord.new_email})});
                    }else{
                        return res.status(400).json({error: "unknown change email verify step"});
                    }
                }else{
                    return res.status(400).json({error: "invalid email or verification code"});
                }
            }else{
                return res.status(400).json({error: 'failed to provide new email'});
            }
        }
    } catch (e) {
        console.error('ERROR /changeemail', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});

//login request returns an access token
router.post('/login', async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";
        
        const [fieldCheck, email, password] = verifyFields(req.body, ['email:string:*:lt', 'password:string']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        const passHash = getHash(password);

        const [user] = await knex('users').select('*').where({email: email, pass_hash: passHash});
        if (user){
            if (user.email===email && user.pass_hash===passHash){
                const accessToken = generateAccessToken({id: user.id, session: user.session});
                res.cookie('accessToken', accessToken, {
                    secure: true,
                    httpOnly: true,
                    sameSite: 'lax'
                });
                return res.status(200).json({});
            }
        }

        return res.status(400).json({error: "invalid email or password"});

    } catch (e) {
        console.error('ERROR /login', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});

//Verify email with sent code, move user from unverified_users to users
router.post('/verifyemail', async (req, res) => {
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";

        //Verify passed in data
        const [fieldCheck, email, verifyCode] = verifyFields(req.body, ['email:string:*:lt', 'verifyCode:string:*:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        const [unverifiedUser] = await knex('unverified_users').select(['*']).where({email: email, verification_code: verifyCode});
        if (!unverifiedUser){
            return res.status(400).json({error: "invalid email or verification code"});//user not found
        }else{
            if (unverifiedUser.verification_code!==verifyCode){
                return res.status(400).json({error: "invalid email or verification code"});
            }else{
                const [{id: userId}] = await knex('users').insert([{email, pass_hash: unverifiedUser.pass_hash, session: 0}], 'id');
                
                await knex('unverified_users').delete().where({email: email, verification_code: verifyCode});
                
                const accessToken = generateAccessToken({id: userId, session: 0});
                res.cookie('accessToken', accessToken, {
                    secure: true,
                    httpOnly: true,
                    sameSite: 'lax'
                });
                return res.status(200).json({id: userId});
            }
        }
    } catch (e) {
        console.error('ERROR /verifyemail', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});

//Add user to unverified users and send email with verification code
router.post('/create', async (req, res)=>{
    try {
        const knex=getKnex();
        if (!knex) throw "database not connected";

        const [fieldCheck, email, password] = verifyFields(req.body, ['email:string:*:lt', 'password:string']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck})

        const passwordCheck = isLegalPassword(password);
        if (passwordCheck) return res.status(400).json({error: 'password is not legal. '+passwordCheck});


        //Check against existing user emails
        const [unverifiedUser] = await knex('unverified_users').select(['email', 'verification_code']).where({email: email});
        const [verifiedUser] = await knex('users').select(['email']).where({email: email});

        if (unverifiedUser && verifiedUser){//should be impossible, but just incase, delete unverified_user with same email
            await knex('unverified_users').delete().where({email: email});
        }

        if (!unverifiedUser && !verifiedUser){
            //Add user if email doesnt exist
            const verifyNumber = generateVerificationCode();
            await knex('unverified_users').insert([{email: email, pass_hash: getHash(password), verification_code: verifyNumber }]);
            await sendMail(email, 'Email verify code', 'Email verification pin '+verifyNumber);
        }else if (verifiedUser){
            //Tell user email is already registered and verified
            await sendMail(email, 'Email is already registered', 'This email is already registered and verified, use forgot password form to reset password.');
        }else if (unverifiedUser){
            //Tell user email is already registered but unverified
            await sendMail(email, 'Email verify code', 'Resending email verification pin '+unverifiedUser.verification_code);
        }
        
        return res.status(201).json({email: email});

    } catch (e) {
        console.error('ERROR /create', req.body, e);
        return res.status(400).json({error: 'failed'});
    }
});