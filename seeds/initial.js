const {getHash, generateVerificationCode} = require('../common/common');

exports.seed = async function(knex) {
    await knex('user_changeemail').del();
    await knex('user_changepassword').del();
    await knex('users').del();
    await knex('unverified_users').del();
    await knex('formats').del();
    await knex('crypto').del();


    const formats = [
        {type: 'jpg', file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 12, fps: 0.66, block: null, filter: null},
        {type: 'jpg', file: 'ih.jpg', title:'I-Hi', w: 1280, h:720, qual: 11, fps: 0.66, block: null, filter: null},
        {type: 'hls', file: 'hqll.m3u8', title:'V-Lo', w: 640, h: 360, qual: 24, fps: 4, block: 2, filter: null},
        {type: 'hls', file: 'best.m3u8', title:'V-Hi', w: 1280, h: 720, qual: 24, fps: 4, block: 2, filter: null}
    ];
    await knex('formats').insert(formats);


    let superPass;
    let superUser;
    if (process.env.FORCE_SQLITE){
        superUser = 'superuser';
        superPass = 'superpass';
        console.log(`SQLite mode active: super user is ${superPass} and password is ${superPass}`);
    }else{
        superUser = process.env.SUPER_USERNAME || ('super_'+generateVerificationCode(2));
        superPass = process.env.SUPER_PASSWORD || generateVerificationCode(8);
    }
    await knex('users').insert({email: superUser, pass_hash: getHash(superPass), role: 'super'});
};