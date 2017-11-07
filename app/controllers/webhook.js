var express = require("express"),
  router = express.Router(),
  config = require("../../config/config"),
  fb = require("../models/work-chat");

module.exports = function (app) {
  app.use("/", router);
};

// Workplace token verification
router.get("/webhook/", function (req, res) {
  if (req.query["hub.verify_token"] === config.verify_token) {
    res.send(req.query["hub.challenge"]);
  }
  res.send("Error, wrong token");
});


// This will be called by Facebook when the webhook is being subscribed
router.get('/webhook/facebook', fbWebhookGet);

// Facebook webhook callbacks are done via POST
router.post('/webhook/facebook', fbWebhookPost);

// var graphapi = request.defaults({
//   baseUrl: 'https://graph.facebook.com',
//   auth: {
//     'bearer': config.page_access_token
//   }
// });

// // Enable page subscriptions for this app, using the app-page token
// function enableSubscriptions() {
//   graphapi({
//     method: 'POST',
//     url: '/me/subscribed_apps'
//   }, function (error, response, body) {
//     // This should return with {success:true}, otherwise you've got problems!
//     console.log('Enabling Subscriptions', body);
//   });
// }

// Subscrbe for message & mention updates
// function subscribePageWebhook() {
//   graphapi({
//     method: 'POST',
//     url: '/app/subscriptions',
//     // Requires app token, not page token
//     auth: { 'bearer': config.page_access_token },
//     qs: {
//       'object': 'page',
//       'fields': 'mention',
//       'include_values': 'true',
//       'verify_token': config.verify_token,
//       'callback_url': config.server_url + '/webhook/facebook'
//     }
//   }, function (error, response, body) {
//     // This should return with {success:true}, otherwise you've got problems!
//     console.log('Subscribing Page Webhook', body);
//   });
// }

function fbWebhookGet(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
    // This verify token string should match whatever you used when you subscribed for the webhook
    req.query['hub.verify_token'] === config.verify_token) {
    console.log('Validating webhook');
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error('Failed validation. Make sure the validation tokens match.');
    res.sendStatus(403);
  }
}

function fbWebhookPost(req, res) {
  //console.log(JSON.stringify(req.body, null, 2));
  if (req.body && req.body.entry) {
    for (var i in req.body.entry) {
      var changes = req.body.entry[i].changes;
      for (var j in changes) {
        // Changes field type = 'posts' for new posts
        if (changes[j].field && changes[j].field === 'mention') {
          if (changes[j].value && changes[j].value.item && changes[j].value.item == 'comment') {
            // comment
            var comment_id = changes[j].value.comment_id;
            var comment_message = changes[j].value.message;
            console.log('Mentioned in comment', comment_id, comment_message);

            // Get the content of the parent post
            var post_id = changes[j].value.post_id;
            graphapi({
              url: '/' + post_id,
              qs: { 'fields': 'message,permalink_url' }
            }, function (error, response, body) {
              if (body) {
                var post = JSON.parse(body);
                likePostOrCommentId(comment_id);
                createIssue(comment_message, post.message, comment_id, post.permalink_url);
              }
            });
          } else if (changes[j].value && changes[j].value.item && changes[j].value.item == 'post') {
            // post
            var postid = changes[j].value.post_id;
            console.log('Mentioned in post', postid);

            // Get the content of the post
            graphapi({
              url: '/' + postid,
              qs: { 'fields': 'message,from{name,email},formatting,permalink_url' }
            }, function (error, response, body) {
              if (body) {
                var post = JSON.parse(body);
                likePostOrCommentId(post.id);

                createIssue('New Issue', post.message, post.id, post.permalink_url);
              }
            });
          }
        } else {
          // Not a mention webhook, do something else here
          console.log('Not a mention webhook, do something else here');
        }
      }
    }
  } else {
    console.error('Webhook Callback', req.body);
  }
  // Always send back a 200 OK, otherwise Facebook will retry the callback later
  res.sendStatus(200);
}

var ghWebhookAll = function (req, res) {
  var payload = JSON.parse(req.body.payload);
  if (payload && payload.action && payload.action != 'opened') {
    var regex = /\[View on Workplace\]\(https:\/\/\w+.facebook.com\/groups\/\d+\/permalink\/(\d+)/i;
    var match = payload.issue.body.match(regex);
    console.log(payload);
    var message = 'Issue ' + payload.action + ' by @[' + jirahandles[payload.sender.login] + '].';
    if (match) {
      replyToPostOrCommentId(match[1], message);
    }
  }
  res.sendStatus(200);
};

var replyToPostOrCommentId = function (id, message) {
  console.log('Replying To Post Or Comment', id, message);
  graphapi({
    method: 'POST',
    url: '/' + id + '/comments',
    qs: {
      'message': message
    }
  }, function (error) {
    if (error) {
      console.error(error);
    }
  });
};

