# Deploy Changes

## When to use
When the user asks to deploy, ship, push to production, or update the live site.

## Steps
1. Commit all changes with a descriptive message:
   ```bash
   git add -A && git commit -m "<description>"
   ```
2. Push to GitHub:
   ```bash
   git push
   ```
3. SSH into the server and deploy:
   ```bash
   ssh root@69.62.126.13 "cd /root/helmies-studio && git pull --ff-only && npm run build && pm2 restart helmies-studio --update-env && sleep 3 && curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:3010/"
   ```
4. Verify the response is `HTTP 200`.
5. If build fails, check the error output, fix the issue, and repeat.

## Important
- Server: 69.62.126.13
- PM2 process: `helmies-studio` (exact name)
- App port: 3010
- Always run `npm run build` before `pm2 restart`
- If nginx config was changed, also run: `scp config/nginx/studio.helmies.fi.conf root@69.62.126.13:/etc/nginx/sites-enabled/ && ssh root@69.62.126.13 "nginx -t && systemctl reload nginx"`
