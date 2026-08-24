# @gracesoft-sentinel/agent-switcher

## 0.1.0

Initial release. Wraps N independently-composed agents (each an already
fully self-contained `onMessage` callback) behind one `onMessage` a single
channel webhook can be pointed at, letting a chatter switch which agent
they're talking to mid-conversation via a command or passphrase — the
capability behind `apps/demo-service`. Deliberately unaware of any specific
agent's internals; sits in the composition layer, not beside
`agent-concierge`/`agent-cook`.
