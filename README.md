# TerverPanel Web

Self-hosted game server management panel (web). Full **Wings + Docker** mode.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/foxstudio-201/terverpanelweb/main/scripts/install.sh | sudo bash
```

Open `http://SERVER_IP:8000` → create admin → manage servers in the browser.

## Stack

- **Frontend:** React 19 + Vite + Tailwind (shared UI with TerverPanel desktop)
- **Backend:** Node.js + Express + WebSocket
- **Runtime:** Wings daemon + Docker containers (Pterodactyl-compatible eggs)

## Develop

```bash
npm install
npm run dev        # frontend :5173 (proxies /api → :8000)
npm run dev:server # API :8000
npm run build      # production frontend → dist/
npm start          # serve API + dist/
```

## Service

```bash
sudo systemctl status terver-panel
journalctl -u terver-panel -f
```

## License

MIT — see [LICENSE](./LICENSE).
