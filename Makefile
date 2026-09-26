# Serve and test the game.

PORT ?= 8003

.PHONY: serve serve-local test check install uninstall status logs

serve:            ## serve on the tailnet, with hot reload
	npx tsx server/main.ts --port $(PORT)

serve-local:      ## serve to this machine only
	npx tsx server/main.ts --port $(PORT) --local

test:             ## unit and API tests
	npx vitest run

check: test       ## type-check, test, and build
	npx tsc --noEmit
	npx vite build

install:          ## run it on every boot, on the tailnet
	mkdir -p data node_modules/.vite $(HOME)/.config/systemd/user
	cp tools/systemd/eleanor-crossing.service $(HOME)/.config/systemd/user/
	systemctl --user daemon-reload
	systemctl --user enable eleanor-crossing
	systemctl --user restart eleanor-crossing
	systemctl --user status --no-pager eleanor-crossing

uninstall:
	systemctl --user disable --now eleanor-crossing
	rm -f $(HOME)/.config/systemd/user/eleanor-crossing.service
	systemctl --user daemon-reload

status:           ## is the service running, and where
	systemctl --user status --no-pager eleanor-crossing

logs:             ## follow the service log
	journalctl --user -u eleanor-crossing -f
