const express = require('express');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword, isValidEmail} = require('../common/common');
const {authenticate, setAccessCookies} = require('../common/accessToken');
const sendMail = require('../common/sendMail');


const router = express.Router();
module.exports = router;



router.post('/changemailend', [needKnex, authenticate.bind(null, 'unverified')], async (req, res) => {
    try {
        const [fieldCheck, confirmCode] = verifyFields(req.body, ['confirmCode:string:*:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const [changeEmailRecord] = await req.knex('user_changeemail').select('*').where({user_id: req.user.id, confirmation_code: confirmCode});
        if (changeEmailRecord){
            await req.knex('user_changeemail').delete().where({user_id: req.user.id});
            await req.knex('users').update({email: changeEmailRecord.new_email}).where({id: req.user.id});
            return res.status(200).json({status: 'success'});
        }
        return res.status(400).json({status: 'invalid confirmation code'});
    } catch (e) {
        console.error('ERROR POST /user/forgotend', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.get('/changemailstatus', [needKnex, authenticate.bind(null, 'unverified')], async (req, res)=>{
    try {
        const [changeEmailRecord] = await req.knex('user_changeemail').select('*').where({user_id: req.user.id});
        if (changeEmailRecord){
            return res.status(200).json({status:'confirm', newEmail: changeEmailRecord.new_email});
        }
        return res.status(200).json({status: 'none'});
    } catch (e) {
        console.error('ERROR GET /changemailstatus', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/changemailstart', [needKnex, authenticate.bind(null, 'unverified')], async (req, res) => {
    try {
        const [fieldCheck, newEmail, password] = verifyFields(req.body, ['newEmail:string:*:lt', 'password:string']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        if (!isValidEmail(newEmail)) return res.status(400).json({error: 'invalid email: '+newEmail});
        
        const passHash=getHash(password);
        const [user] = await req.knex('users').select('id').where({id: req.user.id, pass_hash: passHash});
        if (!user){
            return res.status(400).json({error: 'incorrect password'});
        }

        const [changeEmailRecord] = await req.knex('user_changeemail').select('*').where({user_id: req.user.id});
        if (changeEmailRecord){
            sendMail(
                newEmail, 
                "Change email request resent", 
                "Somone initiated an email change request, the confirmation code is "+changeEmailRecord.confirmation_code,  
                "Somone initiated an email change request, the confirmation code is "+changeEmailRecord.confirmation_code+' or <a href="https://'+process.env.DOMAIN+'/changemailend/'+req.user.email+'/'+changeEmailRecord.confirmation_code+'">Click here</a>'
            );
        }else{
            const confirmationCode =  generateVerificationCode();
            await req.knex('user_changeemail').insert({user_id: req.user.id, new_email: newEmail, confirmation_code: confirmationCode});
            sendMail(
                newEmail,
                "Change email request",
                "Somone initiated an email change request, the confirmation code is "+confirmationCode,  
                "Somone initiated an email change request, the confirmation code is "+confirmationCode+' or <a href="https://'+process.env.DOMAIN+'/changemailend/'+req.user.email+'/'+confirmationCode+'">Click here</a>'
            );
        }
        return res.status(200).json({status: 'check email'});
    } catch (e) {
        console.error('ERROR POST /user/forgotstart', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/changepassword', [needKnex, authenticate.bind(null, 'unverified')], async (req, res)=>{
    try {
        const [fieldCheck, oldPassword, newPassword] = verifyFields(req.body, ['oldPassword:string','newPassword:string']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const passwordCheck = isLegalPassword(newPassword);
        if (passwordCheck){
            return res.status(400).json({error: 'new password is not legal. '+passwordCheck});
        }

        const newPassHash=getHash(newPassword);
        const oldPassHash=getHash(oldPassword);

        let updatedId = null ;
        try {
            [{id: updatedId}] = await req.knex('users').update({pass_hash: newPassHash}).where({id: req.user.id, pass_hash: oldPassHash}).returning(['id']);
        }catch(e){
        }
        if (updatedId!==req.user.id || updatedId===null){
            return res.status(400).json({error: 'probably incorrect old password'});
        }
        return res.json({status: 'success'});

    } catch (e) {
        console.error('ERROR POST /user/changepassword', req.body, e);
        return res.status(400).json({error: 'error'});
    }
})


router.post('/forgotstart', needKnex, async (req, res) => {
    try {
        const [fieldCheck, email] = verifyFields(req.body, ['email:string:*:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        
        const [user] = await req.knex('users').select('*').where({email});
        if (user){
            const [changePassRec] = await req.knex('user_changepassword').select('*').where({user_id: user.id});
            if (changePassRec){
                sendMail(
                    email, 
                    "Forgotten password request resent", 
                    "Somone initiated a forgotten password change request, the confirmation code is "+changePassRec.confirmation_code,  
                    "Somone initiated a forgotten password change request, the confirmation code is "+changePassRec.confirmation_code+' or <a href="https://'+process.env.DOMAIN+'/verifyforgot/'+email+'/'+changePassRec.confirmation_code+'">Click here</a>'
                );
            }else{
                const confirmationCode =  generateVerificationCode();
                await req.knex('user_changepassword').insert({user_id: user.id, confirmation_code: confirmationCode});
                sendMail(
                    email,
                    "Forgotten password request",
                    "Somone initiated a forgotten password change request, the confirmation code is "+confirmationCode,
                    "Somone initiated a forgotten password change request, the confirmation code is "+confirmationCode+' or <a href="https://'+process.env.DOMAIN+'/verifyforgot/'+email+'/'+confirmationCode+'">Click here</a>'
                );
            }
        }
        return res.status(200).json({status: 'check email'});
    } catch (e) {
        console.error('ERROR POST /user/forgotstart', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/forgotend', needKnex, async (req, res) => {
    try {
        const [fieldCheck, email, newPassword, confirmCode] = verifyFields(req.body, ['email:string:*:lt', 'newPassword:string', 'confirmCode:string:*:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        const passwordCheck = isLegalPassword(newPassword);
        if (passwordCheck) return res.status(400).json({error: 'new password is not legal. '+passwordCheck});

        const [user] = await req.knex('users').select('*').where({email});
        if (user){
            const [changePassRec] = await req.knex('user_changepassword').select('*').where({user_id: user.id, confirmation_code: confirmCode});
            if (changePassRec){
                await req.knex('user_changepassword').delete().where({user_id: user.id});
                await req.knex('users').update({pass_hash: getHash(newPassword)}).where({id: user.id});
                return res.status(200).json({status: 'success'});
            }
        }
        return res.status(400).json({status: 'invalid email or confirmation code'});
    } catch (e) {
        console.error('ERROR POST /user/forgotend', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

//login request returns an access token
router.post('/login', needKnex, async (req, res) => {
    try {
        const knex=req.knex;
        
        const [fieldCheck, email, password, remember] = verifyFields(req.body, ['email:string:*:lt', 'password:string', 'remember:boolean:?']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const passHash = getHash(password);

        const [user] = await knex('users').select('*').where({email: email, pass_hash: passHash});
        if (user){
            if (user.email===email && user.pass_hash===passHash){
                setAccessCookies(res, user, remember);
                return res.json({id: user.id, email: user.email, role: user.role});
            }
        }
        return res.status(400).json({error: "invalid email or password"});

    } catch (e) {
        console.error('ERROR POST /user/login', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

//Verify email with sent code, move user from unverified_users to users
router.post('/verifyemail', needKnex, async (req, res) => {
    try {
        const knex=req.knex;

        //Verify passed in data
        const [fieldCheck, email, confirmCode, password] = verifyFields(req.body, ['email:string:*:lt', 'confirmCode:string:*:lt', 'password:string']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        if (!isValidEmail(email)) return res.status(400).json({error: 'invalid email'});
        
        const passwordCheck = isLegalPassword(password);
        if (passwordCheck) return res.status(400).json({error: 'password is not legal. '+passwordCheck});

        const [unverifiedUser] = await knex('unverified_users').select(['*']).where({email: email, confirmation_code: confirmCode});
        if (!unverifiedUser){
            return res.status(400).json({error: "invalid email or confirmation code"});//user not found
        }else{
            if (unverifiedUser.confirmation_code!==confirmCode){
                return res.status(400).json({error: "invalid email or confirmation code"});
            }else{
                const [user] = await knex('users').insert({email, pass_hash: getHash(password), session: 0, role: 'unverified'}).returning('*');
                await knex('unverified_users').delete().where({email: email, confirmation_code: confirmCode});
                setAccessCookies(res, user);
                return res.status(200).json({id: user.id, email: user.email, role: user.role});
            }
        }
    } catch (e) {
        console.error('ERROR POST /user/verifyemail', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

//Add user to unverified users and send email with verification code
router.post('/create', needKnex, async (req, res)=>{
    try {
        const knex=req.knex;

        const [fieldCheck, email] = verifyFields(req.body, ['email:string:*:lt']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        if (!isValidEmail(email)) return res.status(400).json({error: 'invalid email'});


        //Check against existing user emails
        const [unverifiedUser] = await knex('unverified_users').select(['email', 'confirmation_code']).where({email: email});
        const [verifiedUser] = await knex('users').select(['email']).where({email: email});

        if (unverifiedUser && verifiedUser){//should be impossible, but just incase, delete unverified_user with same email
            await knex('unverified_users').delete().where({email: email});
        }

        if (!unverifiedUser && !verifiedUser){
            //Add user if email doesnt exist
            const confirmCode = generateVerificationCode();
            await knex('unverified_users').insert({email: email, confirmation_code: confirmCode });
            await sendMail(email, 'Email confirmation code', 'Email confirmation code '+confirmCode, 'Email confirmation code '+confirmCode+' or <a href="https://'+process.env.DOMAIN+'/verifysignup/'+email+'/'+confirmCode+'">Click to confirm email</a>');
        }else if (verifiedUser){
            //Tell user email is already registered and verified
            await sendMail(email, 'Email is already registered', 'This email is already registered and verified, use forgot password form to reset password.', 'This email is already registered and verified, use forgot password form to reset password. <a href="https://'+process.env.DOMAIN+'/forgotpassword/'+email+'">Click to reset password</a>');
        }else if (unverifiedUser){
            //Tell user email is already registered but unverified
            await sendMail(email, 'Email confirmation code', 'Resending email confirmation code '+unverifiedUser.confirmation_code, 'Resending email confirmation code '+unverifiedUser.confirmation_code+' or <a href="https://'+process.env.DOMAIN+'/verifysignup/'+email+'/'+unverifiedUser.confirmation_code+'">Click to confirm email</a>');
        }
        
        return res.status(201).json({email});

    } catch (e) {
        console.error('ERROR POST /user/create', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.get('/me', authenticate.bind(null, 'unverified'), async (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (e) {
        console.error('ERROR GET /me', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/logout', authenticate.bind(null, 'unverified'), async (req, res) => {
    try {
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
        return res.status(200).json({message: 'logged out'});
    } catch (e) {
        console.error('ERROR POST /user/logout', e);
        return res.status(400).json({error: 'error'});
    }
});