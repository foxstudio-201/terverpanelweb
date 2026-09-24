# TerverPanel Web

Self-hosted game server management panel (web). Full **Wings + Docker** mode.

## Install (1 line — Docker + Wings + Panel)

```bash
curl -fsSL https://raw.githubusercontent.com/foxstudio-201/terverpanelweb/main/scripts/install.sh | sudo bash
```

The installer will:

1. Install **Node.js 22** (if missing)
2. Install & start **Docker** via [get.docker.com](https://get.docker.com) (if missing)
3. Clone this repo → `/opt/terver-panel` and build the UI
4. Generate a Wings API token → `~/.config/terver-panel/wings-api-token.json`
5. Download **Wings** binary → `/usr/local/bin/wings`
6. Write Wings config → `/etc/lunarspace-wings/config.yml`
7. Install & enable systemd units:
   - `terver-panel` → panel on `:8000`
   - `lunarspace-wings` → Wings API on `:8080`

Open `http://SERVER_IP:8000` → create admin (OOBE) → manage servers.

### Optional env

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8000` | Panel port |
| `TERVER_DIR` | `/opt/terver-panel` | Install path |
| `WINGS_REPO` | `foxstudio-201/lunarspacewinglunar` | Wings release repo |
| `FORCE_WINGS_CONFIG` | `0` | `1` = overwrite existing `config.yml` |

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
sudo systemctl status terver-panel lunarspace-wings docker
journalctl -u terver-panel -f
journalctl -u lunarspace-wings -f
```

## License

MIT — see [LICENSE](./LICENSE).
