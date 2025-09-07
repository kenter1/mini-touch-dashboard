const { parseStringPromise } = require('xml2js');

module.exports = {
  id: 'feed',
  title: 'Feed',
  render(container, { config, addTimer } = {}) {
    container.innerHTML = `<div class="title">Feed</div><div class="feed" id="dFeed"></div>`;
    async function loadFeeds() {
      const list = container.querySelector('#dFeed'); if (!list) return;
      list.innerHTML = '';
      for (const feedUrl of ((config && config.rssFeeds) || [])) {
        try {
          const res = await fetch(feedUrl);
          const xml = await res.text();
          const parsed = await parseStringPromise(xml, { explicitArray: false });
          const items = (parsed.rss && parsed.rss.channel && parsed.rss.channel.item)
            ? parsed.rss.channel.item
            : (parsed.feed && parsed.feed.entry) ? parsed.feed.entry : [];
          const arr = Array.isArray(items) ? items.slice(0, 5) : [items];
          arr.filter(Boolean).forEach(item => {
            const title = item.title && (item.title._ || item.title) || 'Untitled';
            const link = item.link && (item.link.href || item.link[0] || item.link) || '#';
            const div = document.createElement('div');
            div.className = 'feed-item';
            div.innerHTML = `<a href="${link}" onclick="require('electron').shell.openExternal('${link}'); return false;">${title}</a>`;
            list.appendChild(div);
          });
        } catch (e) {
          const div = document.createElement('div');
          div.className = 'feed-item';
          div.textContent = `Failed to load: ${feedUrl}`;
          list.appendChild(div);
        }
      }
    }
    loadFeeds(); if (typeof addTimer === 'function') addTimer(setInterval(loadFeeds, (config && config.refresh && config.refresh.rssMs) || 600000));
  }
};

