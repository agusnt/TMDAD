var mongoose = require('mongoose');
var User = mongoose.model('User');
var TwitterStrategy = require('passport-twitter').Strategy;
const config = require('./config.js');

module.exports = function(passport) {

    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    passport.deserializeUser(function(obj, done) {
        done(null, obj);
    });

    passport.use(new TwitterStrategy({
        consumerKey: config.twitter.key,
        consumerSecret: config.twitter.key_secret,
        callbackURL: '/auth/twitter/callback'
    }, function(accessToken, refreshToken, profile, done) {
        // Search in data base
        User.findOne({provider_id: profile.id}, function(err, user) {
			if(err) throw(err);

            // Already in DB
			if(!err && user!= null) return done(null, user);

			// Not exist, create it
			var user = new User({
				provider_id	: profile.id,
				provider		 : profile.provider,
				name				 : profile.displayName,
				photo				: profile.photos[0].value
			});

			user.save(function(err) {
				if(err) throw err;
				done(null, user);
			});
        });
    }));
};
