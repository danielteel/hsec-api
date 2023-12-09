const crypto = require('crypto');

//Returns a SHA-256 hash of input string in hex format
function getHash(string){
    if (!string) return null;
    var hash = crypto.createHash('sha256');
    data = hash.update(string, 'utf-8');
    return (data.digest('hex'));
}

//verifyFields - will return a string with reasons failed if obj doesnt match fields array
//If passes the check, will return an empty string and the rest of the named fields.
//fields should look something like ['username:string:*:lt', 'age:number', 'extraWhatever:any', 'optionalBool:bool:?']
//This says that the object should have
// - a username of type string, required, lowercase and trim it
// - an age of type number, required
// - an extraWhatever of any kind of type except undefined, required
// - an optionalBool of type bool or undefined (its optional)
function verifyFields(obj, fields){
    let retArray = [''];
    let failedFor = '';
    for (const field of fields){
        const [name, type, optional, modifiers] = field.split(':');
        retArray.push(obj[name]);
        if (typeof obj[name]!==type){
            if (!(obj[name]===undefined && optional==='?')){
                if (type!=='any' || optional!=='?' && obj[name]===undefined){
                    failedFor+=`expected ${name} to be of type ${type}, recieved type ${typeof obj[name]}. `;
                    retArray.pop();
                    retArray.push(undefined);
                }
            }
        }
        if (retArray[retArray.length-1]!==undefined && modifiers && typeof obj[name]==='string'){
            if (modifiers.toLowerCase().includes('l')) retArray[retArray.length-1]=retArray[retArray.length-1].toLowerCase();
            if (modifiers.toLowerCase().includes('u')) retArray[retArray.length-1]=retArray[retArray.length-1].toUpperCase();
            if (modifiers.toLowerCase().includes('t')) retArray[retArray.length-1]=retArray[retArray.length-1].trim();
        }
    }
    retArray[0]=failedFor.trim();
    return retArray;
}


function isLegalPassword(password){
    if (typeof password !== 'string') return 'must be a string.';
    let failFor = '';
    if (password.trim() !== password){
        failFor+='no leading or trailing spaces allowed. ';
    }

    const upper = /[A-Z]/g;
    const lower = /[a-z]/g;
    const digit = /[0-9]/g;
    const special = /[\`\~\!\@\#\$\%\^\&\*\(\)\-\_\=\+\[\]\;\'\,\.\/\{\}\\\:\"\<\>\?\|]/g;

    if (!password.match(upper)) failFor+='must have at least one uppercase character. ';
    if (!password.match(lower)) failFor+='must have at least one lowercase character. ';
    if (!password.match(digit)) failFor+='must have at least one digit. ';
    if (!password.match(special)) failFor+='must have at least one special character. ';
    if (password.trim().length>36) failFor+='must be less than 36 characters. ';
    if (password.trim().length<8) failFor+='must be at least 8 characters. ';
    return failFor.trim();
}


module.exports = {getHash, verifyFields, randomInt: crypto.randomInt, isLegalPassword};