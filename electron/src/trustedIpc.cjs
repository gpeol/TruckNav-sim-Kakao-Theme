function requireAppMainFrame(event, window, scheme) {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted app request');
    let url;
    try { url = new URL(event.senderFrame.url); } catch { throw new Error('Untrusted app request'); }
    if (url.protocol !== `${scheme}:` || url.hostname !== '-') throw new Error('Untrusted app request');
}
module.exports = { requireAppMainFrame };
