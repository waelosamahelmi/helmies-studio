#!/bin/bash
cd /root/helmies-studio
SESSION=dev-terminal
tmux has-session -t ${SESSION} 2>/dev/null || tmux new-session -d -s ${SESSION} -c /root/helmies-studio
exec /usr/bin/ttyd -p 3090 -W tmux attach-session -t ${SESSION}
