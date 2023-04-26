// スクリプト プロパティに保存した変数を取得する。
const properties = PropertiesService.getScriptProperties().getProperties();
const msgCache = CacheService.getScriptCache();

function doPost(e) {
  var data = JSON.parse(e.postData.getDataAsString());

  if (data.type == "url_verification") {
    return ContentService.createTextOutput(data.challenge);
  }

  const ts = data.event.event_ts;
  const userId = data.event.user;
  const text = data.event.text;
  var questionMsg = text.replace(/^<.+> /, "").trim();

  if (isExistCache(ts)) {
    // 同じevent_tsのリクエストはレスポンスしない
    return ContentService.createTextOutput('OK');
  }

  // ユーザーのこれまでのやりとりに関するキャッシュを取得する
  var userMsgCache = JSON.parse(msgCache.get(userId));
  var expiredTime = (properties.EXPIRED_TIME === undefined) ? 600 : properties.EXPIRED_TIME; // キャッシュの保持時間

  // これまでのやりとりに関するキャッシュを削除する
  if (questionMsg == 'remove') {
    msgCache.remove(userId);
    postToSlack(`<@${userId}> remove conversations cache b/w you and ChatGPT.`);
    return ContentService.createTextOutput('OK');
  }
  
  try {
    var conversations = [];

    // キャッシュがあるとき、これまでのやりとりを取得する
    if (userMsgCache != null) {
      conversations = userMsgCache.conversations;
    }
    conversations.push({'role': 'user', 'content': questionMsg});

    // ChatGPTにメッセージを投げる
    const replyMsg = requestChatGPT(conversations);
    if(!replyMsg) return ContentService.createTextOutput('OK');

    // 今回のメッセージとChatGPTによる返答をキャッシュに保存する
    conversations.push({'role': 'assistant', 'content': replyMsg});
    msgCache.put(userId, JSON.stringify({conversations: conversations}), expiredTime);

    // Slackに投稿する
    postToSlack(`<@${userId}> \n ${replyMsg}`);

    return ContentService.createTextOutput('OK');
  } catch(e) {
    return ContentService.createTextOutput('NG');
  }
}

function isExistCache(id) {
  const cache = CacheService.getScriptCache();
  const isCached = cache.get(id);
  if (isCached){ return true; }

  cache.put(id, true, 60 * 5);
  return false;
}

function postToSlack(text) {
  var url = "https://slack.com/api/chat.postMessage";
  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + properties.SLACK_BOT_TOKEN,
      "Content-type": "application/json; charset=utf-8"
    },
    "payload": JSON.stringify({
      "channel": properties.SLACK_CHANNEL_ID,
      "text": text
    })
  };

  var response = UrlFetchApp.fetch(url, options);
}

function requestChatGPT(messages) {
  var openai_url = "https://api.openai.com/v1/chat/completions";
  var headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': 'Bearer ' + properties.OPEN_AI_KEY,
  };

  var options = {
    'method' : 'post',
    'headers' : headers,
    'payload' : JSON.stringify({
      'model': 'gpt-3.5-turbo',
      'messages': messages
      }),
    'muteHttpExceptions':true
  };

  const response = UrlFetchApp.fetch(openai_url, options);  
  var json = JSON.parse(response.getContentText('UTF-8'));

  return json["choices"][0]["message"]["content"];
}

function test() {
  var result = requestChatGPT('自己紹介してください。');
  Logger.log(result);
}