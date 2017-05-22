const TwitterStrategy = require('passport-twitter').Strategy;

// expose this function to our app using module.exports
module.exports = function(passport) {

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
        //done(null, user.id);
        done(null, 1);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
        //ddbb.findUserById(id, function(err, user) {
        //    done(err, user);
        //});
       done(null, user.id)
    });

    /*
     * Login with Twitter
     * Bug API and passport-twitter: https://github.com/jaredhanson/passport-linkedin/issues/6
     * It's work fine, so no problem
     */
    passport.use('twitter', new TwitterStrategy({
        consumerKey: conf.credentials.twitter.consumerKey,
        consumerSecret: conf.credentials.twitter.consumerSecret,
        callbackURL: conf.credentials.twitter.callbackURL
    }, function(token, tokenSecret, profile, done) {
        process.nextTick(function() {
            var json = {"username": profile.username, "id_": profile.id + 'twitter',
                "token": token, "rol": "USER"};
            ddbb.addUser(json, function(err, res){
                //User exist
                if (err !== null && err.code === 11000) done(null, res);
                else{
                    if(err !== null || !res) done(err);
                    else done(null, res);
                }
            })
        });
    }));

    /*
     * Login with google
     */
    passport.use(new GoogleStrategy({
        clientID: conf.credentials.google.clientID,
        clientSecret: conf.credentials.google.clientSecret,
        callbackURL: conf.credentials.google.callbackURL,
        passReqToCallback: true
    }, function(req, token, refreshToken, profile, done) {
        process.nextTick(function(){
            var json = {"username": profile.displayName, "id_": profile.id + "google",
                "token": token, "rol": "USER"};
            ddbb.addUser(json, function(err, res){
                //user exist
                if (err !== null && err.code === 11000) done(null, res);
                else{
                    if(err !== null || !res) done(err);
                    else done(null, res);
                }
            });
        });
    }));
};
