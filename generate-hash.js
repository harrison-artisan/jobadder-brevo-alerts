const bcrypt = require('bcrypt');

const password = 'ArtisanRec1!';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
    if (err) {
        console.error('Error generating hash:', err);
        process.exit(1);
    }
    console.log('Bcrypt hash for password "ArtisanRec1!":');
    console.log(hash);
    console.log('\nCopy this hash and paste it into users.json as the passwordHash value.');
    process.exit(0);
});
