// Popup script: communicates with the content script on the active tab.

const $ = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isBilibili(url) {
  return typeof url === 'string' && /^https?:\/\/(www\.)?bilibili\.com\//.test(url);
}

async function send(msg) {
  const tab = await activeTab();
  if (!tab) return null;
  return chrome.tabs.sendMessage(tab.id, msg);
}

async function refresh() {
  const status = $('status');
  const btn = $('toggle');
  const tab = await activeTab();
  if (!tab || !isBilibili(tab.url)) {
    status.textContent = '请打开 bilibili.com 的视频播放页';
    btn.textContent = '不可用';
    btn.disabled = true;
    return;
  }
  try {
    const resp = await send({ type: 'bg-get-state' });
    if (!resp) throw new Error('no response');
    status.textContent = `摄像头：${resp.state}（${resp.gestureZh || resp.gesture}）`;
    btn.textContent = resp.running ? '暂停识别' : '开启摄像头';
    btn.disabled = false;
  } catch (e) {
    status.textContent = '本页未加载手势控制（刷新页面试试）';
    btn.textContent = '不可用';
    btn.disabled = true;
  }
}

$('toggle').addEventListener('click', async () => {
  const btn = $('toggle');
  btn.disabled = true;
  try {
    const resp = await send({ type: 'bg-toggle' });
    if (resp) {
      $('status').textContent = `摄像头：${resp.state}`;
      btn.textContent = resp.running ? '暂停识别' : '开启摄像头';
    }
  } catch (e) {
    $('status').textContent = '操作失败：' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
});

refresh();
