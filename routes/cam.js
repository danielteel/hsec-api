const express = require('express');
const {authenticate} = require('../common/accessToken');


const router = express.Router();
module.exports = router;

function isValidFile(str){
    let dotCount=0;
    for (let i=0;i<str.length;i++){
        if (str[i]==='.') dotCount++;
    }
    if (dotCount>1) return false;
    return true;
}

router.get('/:file', authenticate, (req, res) => {
    if (!isValidFile(req.params.file)){
        res.sendStatus(404);
    }else{
        if (req.body.user.permissions.view){
            res.sendFile('/mnt/ramdisk/cam/' + req.params.file);
        }else{
            res.sendStatus(403);//user doesnt have view permissions
        }
    }
});