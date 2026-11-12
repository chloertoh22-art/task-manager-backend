# Deploy a Full-Stack Task Manager on AWS
### React on Amplify · Node.js on EC2 · MySQL on RDS: a hands-on student guide

In this lab you take a working web app and put it on the internet using real AWS services.
By the end, anyone in the world can open your app's URL, add tasks, and those tasks are saved in a
cloud database.

**Time needed:** about 2–3 hours  
**Level:** beginner to intermediate (you should be comfortable typing commands in a terminal)

---

## Table of contents

0. [The big picture](#0-the-big-picture)
1. [Before you start](#1-before-you-start)
2. [Run the app on your own computer (optional)](#2-run-the-app-on-your-own-computer-optional)
3. [Put both repos on GitHub](#3-put-both-repos-on-github)
4. [Create the security groups (the firewalls)](#4-create-the-security-groups-the-firewalls)
5. [Create the MySQL database on RDS](#5-create-the-mysql-database-on-rds)
6. [Launch the EC2 server](#6-launch-the-ec2-server)
7. [Install the software on the server](#7-install-the-software-on-the-server)
8. [Deploy the backend API](#8-deploy-the-backend-api)
9. [Add HTTPS with Nginx and Let's Encrypt](#9-add-https-with-nginx-and-lets-encrypt)
10. [Deploy the frontend on Amplify](#10-deploy-the-frontend-on-amplify)
11. [Lock down CORS](#11-lock-down-cors)
12. [Test everything end to end](#12-test-everything-end-to-end)
13. [Ship an update](#13-ship-an-update)
14. [Troubleshooting](#14-troubleshooting)
15. [Clean up: don't skip this!](#15-clean-up-dont-skip-this)
16. [Check your understanding and bonus challenges](#16-check-your-understanding-and-bonus-challenges)

---

## 0. The big picture

```
   Your browser
       │
       │ 1. https://main.d1a2b3c4.amplifyapp.com           (the React website)
       ▼
 ┌──────────────┐
 │ AWS Amplify  │  Builds the React app from GitHub and serves it worldwide over HTTPS
 └──────────────┘
       │
       │ 2. The website calls the API: https://13-250-1-2.sslip.io/api/tasks
       ▼
 ┌───────────────────────────── EC2 server (Ubuntu) ─────────────────────────────┐
 │  Nginx (port 443, HTTPS certificate) ──► Node.js / Express API (port 3000)    │
 │                                          kept running by PM2                  │
 └───────────────────────────────────────────────────────────────────────────────┘
       │
       │ 3. SQL queries on port 3306 (only the EC2 server is allowed in)
       ▼
 ┌──────────────┐
 │  RDS MySQL   │  Managed database: AWS handles backups, patches, and disks
 └──────────────┘
```

| Piece | What it is | Why we use it |
|---|---|---|
| **Amplify** | Hosting for static websites | Connects to GitHub, builds on every `git push`, gives you HTTPS for free |
| **EC2** | A virtual server (a computer in the cloud) | Runs our Node.js API. You manage it yourself, like a real server |
| **RDS** | A managed MySQL database | No need to install or back up MySQL yourself |
| **Security group** | A firewall around EC2 / RDS | Controls who may connect to which port |
| **Elastic IP** | A fixed public IP address | So your server's address doesn't change when it restarts |
| **Nginx** | A web server / reverse proxy | Handles HTTPS on port 443 and forwards requests to Node.js |
| **PM2** | A process manager for Node.js | Keeps the API running in the background and restarts it after a crash or reboot |
| **sslip.io** | A free DNS service | `13-250-1-2.sslip.io` points to IP `13.250.1.2`, so you get a hostname without buying a domain |
| **Let's Encrypt** | A free certificate authority | Gives your hostname a real HTTPS certificate |

> **Note:** the app has no login. Anyone who knows your URL can add or delete tasks. That's fine
> for this lab, but never put real or personal data in it.

> **Why do we need HTTPS on the backend?**
> Amplify serves your website over `https://`. Browsers **block** an HTTPS page from calling an
> `http://` API (this is called *mixed content*). So the API must also use HTTPS.

### The two repositories

| Repo | Contains | Deployed to |
|---|---|---|
| `task-manager-backend` | Node.js + Express REST API, database scripts, Nginx/PM2 config | EC2 (+ RDS) |
| `task-manager-frontend` | React app built with Vite | Amplify |

---

## 1. Before you start

### You need
- An **AWS account** (a new account on the Free plan comes with credits that cover this lab)
- A **GitHub account**
- **Git** and **Node.js 22 or 24** (LTS) on your computer ([nodejs.org](https://nodejs.org))
- A terminal: Terminal (Mac/Linux) or PowerShell (Windows)

### Pick ONE AWS region and stay in it
In the top-right corner of the AWS console, choose a region, for example
**Asia Pacific (Singapore) `ap-southeast-1`**. Create **everything** in this lab in the same region.
EC2 and RDS must be in the same region (and the same VPC) to talk to each other.

> **Sharing one AWS account with classmates?** Names must be unique inside one account, so add
> your name to everything you create (e.g. `ali-task-api-sg`, `ali-task-db`, `ali-task-key`).
> A shared account also has limits (by default only 5 Elastic IPs per region), so your instructor
> may need to request a quota increase, and the credits run out much faster. At clean-up time,
> delete **only your own** resources. With your own account you can use the names as written.

### About cost
- Choose options marked **Free tier eligible** (EC2 `t3.micro`, RDS `db.t4g.micro` or `db.t3.micro`).
- New accounts get Free Tier credits. Public IPv4 addresses (including Elastic IPs) and running
  databases are billed by the hour, and the credits pay for that.
- **When you finish, do [Step 15 (Clean up)](#15-clean-up-dont-skip-this).** Resources you forget keep
  costing money.

### Your worksheet: fill this in as you go
Copy this table into a notes file. You'll need these values many times.

| Item | Your value |
|---|---|
| AWS region | |
| GitHub username | |
| Elastic IP of the EC2 server | |
| API hostname (`<ip-with-dashes>.sslip.io`) | |
| RDS endpoint | |
| RDS master username | `admin` |
| RDS master password | |
| Amplify app URL | |

---

## 2. Run the app on your own computer (optional)

Running the app locally first helps you understand what you're about to deploy. You need MySQL on
your computer. Either install MySQL Community Server, or if you have Docker:

```bash
docker run --name taskdb -e MYSQL_ROOT_PASSWORD=secret -p 3306:3306 -d mysql:8.4
```
MySQL needs about 30 seconds to start the first time. Wait before running `npm run db:init`.

**Backend** (terminal 1):
```bash
cd task-manager-backend
npm install
cp .env.example .env          # Windows PowerShell: copy .env.example .env
# edit .env: set DB_PASSWORD (e.g. secret if you used the Docker command above)
npm run db:init               # creates the database, the table and 3 sample tasks
npm run dev                   # API on http://localhost:3000
```
Open <http://localhost:3000/api/health>. You should see `"database":"ok"`.

**Frontend** (terminal 2):
```bash
cd task-manager-frontend
npm install
cp .env.example .env.local    # contains VITE_API_URL=http://localhost:3000
npm run dev                   # website on http://localhost:5173
```
Open <http://localhost:5173>. The green bar at the top should say **API ✓ Database ✓**.

✅ **Checkpoint:** you can add, edit, change status, filter and delete tasks locally.

---

## 3. Put both repos on GitHub

Amplify deploys from GitHub, and the EC2 server will `git clone` the backend from GitHub.

1. **First time using Git on this computer?** Tell Git who you are (use your GitHub email):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```
2. On GitHub, create two **empty, public** repositories (no README, no .gitignore):
   `task-manager-backend` and `task-manager-frontend`.
3. Push each folder (replace `YOUR-USERNAME`):

> **Login on `git push`:** GitHub does not accept your account password here. On Windows, Git
> opens a browser window to sign in. On Mac, if it asks for a password, either install the GitHub
> CLI and run `gh auth login`, or create a *personal access token* (GitHub → Settings → Developer
> settings) and paste it as the password.

```bash
cd task-manager-backend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/task-manager-backend.git
git push -u origin main
```

```bash
cd ../task-manager-frontend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/task-manager-frontend.git
git push -u origin main
```

> The `.gitignore` files make sure `node_modules/` and your `.env` secrets are **not** uploaded.
> Never commit passwords to GitHub.

✅ **Checkpoint:** both repos show your code on github.com, and neither contains a `.env` file.

---

## 4. Create the security groups (the firewalls)

A **security group** is a firewall. We create two:

| Name | Attached to | Allows in |
|---|---|---|
| `task-api-sg` | EC2 server | SSH (22) from **your IP**, HTTP (80) and HTTPS (443) from **anywhere** |
| `task-db-sg` | RDS database | MySQL (3306) **only from `task-api-sg`** |

The key idea: the database **cannot** be reached from the internet. Only your EC2 server can talk to it.

### 4a. `task-api-sg`
1. Open the **EC2** console → left menu **Network & Security → Security Groups** → **Create security group**.
2. **Name:** `task-api-sg` · **Description:** `Task API server` · **VPC:** the default VPC.
3. **Inbound rules → Add rule** three times:

   | Type | Source |
   |---|---|
   | SSH | My IP |
   | HTTP | Anywhere-IPv4 |
   | HTTPS | Anywhere-IPv4 |

4. Leave outbound rules as they are → **Create security group**.

### 4b. `task-db-sg`
1. **Create security group** again. **Name:** `task-db-sg` · **Description:** `Task database` · same default VPC.
2. **Inbound rules → Add rule:** Type **MYSQL/Aurora** (port 3306) · Source **Custom** → start
   typing `task-api-sg` and select it (it looks like `sg-0abc...`).
3. **Create security group**.

✅ **Checkpoint:** you have two security groups, and `task-db-sg` has one inbound rule whose
source is `task-api-sg` (not an IP address).

---

## 5. Create the MySQL database on RDS

Start this step now. The database takes 5–10 minutes to be ready, and you can do Step 6 meanwhile.

1. Open the **RDS** console → **Databases** → **Create database**.
2. **Creation method:** **Standard create**.
3. **Engine:** **MySQL** (keep the default version).
4. **Templates:** **Free tier** (if you see **Sandbox** instead, your account is on the paid plan: choose
   Sandbox).
5. **Settings:**
   - **DB instance identifier:** `task-db`
   - **Master username:** `admin`
   - **Credentials management:** **Self managed**
   - **Master password:** make a strong password using **only letters and numbers**
     (for example `TaskDb2026xyzABC`). Symbols like `#` or `$` cause problems in `.env` files.
     Write it in your worksheet.
6. **Instance configuration:** `db.t4g.micro` or `db.t3.micro`.
7. **Storage:** 20 GiB. Under *Additional storage configuration*, **uncheck** *Enable storage autoscaling*.
8. **Connectivity:**
   - **Compute resource:** *Don't connect to an EC2 compute resource* (we set up the firewall ourselves)
   - **VPC:** default VPC
   - **Public access:** **No** ← important
   - **VPC security group:** *Choose existing* → remove `default` → select **`task-db-sg`**
9. **Additional configuration** (expand it at the bottom of the page):
   - **Initial database name:** `taskmanager`
   - **Deletion protection:** unchecked (so you can delete it at the end)
10. **Create database**.

When the status becomes **Available**, click `task-db` → **Connectivity & security** tab → copy the
**Endpoint** (looks like `task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com`) into your worksheet.

✅ **Checkpoint:** `task-db` status is **Available** and you saved the endpoint.

---

## 6. Launch the EC2 server

### 6a. Launch the instance
1. **EC2** console → **Instances** → **Launch instances**.
2. **Name:** `task-api-server`
3. **Application and OS Images:** **Ubuntu** → **Ubuntu Server 24.04 LTS** (64-bit x86).
4. **Instance type:** **t3.micro** (marked *Free tier eligible*).
5. **Key pair:** **Create new key pair** → name `task-key` → type RSA → format `.pem` →
   **Create**. The file downloads. **Keep it safe; you can't download it again.**
6. **Network settings → Edit:**
   - **Auto-assign public IP:** Enable
   - **Firewall:** *Select existing security group* → **`task-api-sg`**
7. **Storage:** keep the default (8 GiB gp3 is enough).
8. **Launch instance**.

### 6b. Give it a fixed IP (Elastic IP)
1. Left menu **Network & Security → Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.
2. Select the new IP → **Actions → Associate Elastic IP address** → **Instance:** `task-api-server` → **Associate**.
3. Write the IP in your worksheet, e.g. `13.250.1.2`.
4. Your **API hostname** is that IP with dashes plus `.sslip.io`: `13-250-1-2.sslip.io`. Write it down too.

### 6c. Connect with SSH
**Mac / Linux:**
```bash
cd ~/Downloads                     # wherever task-key.pem was saved
chmod 400 task-key.pem             # SSH refuses keys that other users can read
ssh -i task-key.pem ubuntu@13.250.1.2
```
**Windows (PowerShell):**
```powershell
cd $HOME\Downloads
ssh -i .\task-key.pem ubuntu@13.250.1.2
```
Type `yes` when asked about the fingerprint.

> **Alternative:** in the EC2 console select the instance → **Connect** → **EC2 Instance Connect** →
> **Connect** opens a terminal in your browser. For this to work, the SSH rule in `task-api-sg` must
> allow the EC2 Instance Connect service. The simplest option for a short lab is to change the SSH
> source to *Anywhere-IPv4* (login still requires the key).
> (Safer: instead of *Anywhere*, choose the source `com.amazonaws.<your-region>.ec2-instance-connect`
> from the prefix-list search box.) Use this too if `ssh` times out on campus or office Wi-Fi:
> many networks block port 22.

✅ **Checkpoint:** your prompt looks like `ubuntu@ip-172-31-xx-xx:~$`. You're on the server.
**From now on, every command runs on the EC2 server** unless the guide says otherwise.

---

## 7. Install the software on the server

```bash
# 1. Update the package list and install Git, Nginx, the MySQL client and Certbot
sudo apt update
sudo apt install -y git nginx mysql-client certbot python3-certbot-nginx

# 2. Install Node.js 24 LTS from NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs

# 3. Install PM2 (process manager) globally
sudo npm install -g pm2

# 4. Check versions
node -v      # v24.x
npm -v
pm2 -v
nginx -v
```

> If a purple screen says *"Daemons using outdated libraries"* / *"Which services should be
> restarted?"*, just press **Enter** to accept.

Now prove that the server can reach the database. Replace the endpoint with yours and type the
RDS password when asked:

```bash
mysql -h task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com -u admin -p
```
```sql
SHOW DATABASES;     -- you should see "taskmanager" in the list
exit
```

✅ **Checkpoint:** `SHOW DATABASES;` lists `taskmanager`. If the command hangs, see
[Troubleshooting](#14-troubleshooting): it's almost always the `task-db-sg` rule.

---

## 8. Deploy the backend API

### 8a. Get the code and install packages
```bash
cd ~
git clone https://github.com/YOUR-USERNAME/task-manager-backend.git
cd task-manager-backend
npm ci --omit=dev          # installs exactly the versions in package-lock.json, without test tools
```

### 8b. Configure the environment
```bash
cp .env.example .env
nano .env
```
Change these lines (use **your** endpoint and password):
```ini
PORT=3000
DB_HOST=task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=TaskDb2026xyzABC
DB_NAME=taskmanager
DB_SSL=true
CORS_ORIGIN=
```
Save in nano: **Ctrl+O**, **Enter**, then exit: **Ctrl+X**.

> `DB_SSL=true` encrypts the traffic between EC2 and RDS.
> `CORS_ORIGIN` stays empty for now. We fill it in at [Step 11](#11-lock-down-cors).

### 8c. Create the table and sample data
```bash
npm run db:init
```
Expected output:
```
Connecting to MySQL at task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com:3306 as admin ...
✅ Database "taskmanager" and table "tasks" are ready.
✅ Added 3 sample tasks.
```
If it fails, read the `Hint:` line. It explains the most common mistakes in plain words.

### 8d. Start the API with PM2
```bash
pm2 start ecosystem.config.cjs
pm2 status                       # task-api should be "online"
curl http://localhost:3000/api/health
```
Expected: `{"status":"ok","database":"ok",...}`

Make PM2 start the API automatically when the server reboots:
```bash
pm2 startup
# PM2 prints a command that starts with "sudo env PATH=...". Copy it, paste it and run it.
pm2 save
```

Useful PM2 commands:

| Command | What it does |
|---|---|
| `pm2 status` | List apps and their state |
| `pm2 logs task-api` | Live logs (Ctrl+C to stop watching) |
| `pm2 restart task-api` | Restart after changing code or `.env` |
| `pm2 stop task-api` | Stop the API |

✅ **Checkpoint:** `curl http://localhost:3000/api/health` returns `"database":"ok"`.

> Port 3000 is **not** open in the security group, so the internet can't reach Node.js directly.
> Only Nginx (next step) can, because it runs on the same server.

---

## 9. Add HTTPS with Nginx and Let's Encrypt

### 9a. Set your API hostname
Your public IP with dots replaced by dashes, plus `.sslip.io`. This command builds it for you:
```bash
export API_HOST="$(curl -s https://checkip.amazonaws.com | tr . -).sslip.io"
echo $API_HOST                 # e.g. 13-250-1-2.sslip.io (must match your Elastic IP!)
echo "export API_HOST=$API_HOST" >> ~/.bashrc    # remember it in future SSH sessions too
```

### 9b. Configure Nginx as a reverse proxy
```bash
echo $API_HOST                 # must NOT be empty! If it is, go back to 9a
cd ~/task-manager-backend
sudo cp deploy/nginx.conf /etc/nginx/sites-available/task-api
sudo sed -i "s/YOUR_API_HOST/$API_HOST/" /etc/nginx/sites-available/task-api
sudo ln -sf /etc/nginx/sites-available/task-api /etc/nginx/sites-enabled/task-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                  # must say "syntax is ok" and "test is successful"
sudo systemctl reload nginx
```

**On your own computer**, open `http://13-250-1-2.sslip.io/api/health` (your hostname).

✅ **Checkpoint:** the browser shows `"database":"ok"` over plain **http**.

### 9c. Get a free HTTPS certificate
Back on the server (replace the email address with yours):
```bash
echo $API_HOST                 # must NOT be empty
sudo certbot --nginx -d "$API_HOST" --agree-tos -m your-email@example.com --no-eff-email --redirect
```
Certbot proves to Let's Encrypt that you control the hostname (that's why port 80 must be open),
installs the certificate, adds HTTPS to the Nginx config, and redirects http → https.
Certificates renew automatically. Test the renewal with:
```bash
sudo certbot renew --dry-run
```

✅ **Checkpoint:** `https://13-250-1-2.sslip.io/api/health` works in your browser with a padlock 🔒.
Save this **https** URL (without `/api/health`). It's your `VITE_API_URL`.

---

## 10. Deploy the frontend on Amplify

1. Open the **AWS Amplify** console → **Create new app**.
2. **Deploy your app:** **GitHub** → **Next**. Sign in to GitHub and authorize AWS Amplify.
   If your repo isn't listed, click *Update GitHub permissions* and give Amplify access to `task-manager-frontend`.
3. **Repository:** `task-manager-frontend` · **Branch:** `main` → **Next**.
4. **App settings:** Amplify detects `amplify.yml` from the repo automatically; leave the build settings as they are.
   Open **Advanced settings** → **Environment variables** → **Add new**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://13-250-1-2.sslip.io` (your API hostname: **https**, no trailing `/`) |

5. **Next** → **Save and deploy**. Wait 2–4 minutes until the build is **Deployed**.
   If you forgot the variable, the build **fails** with *VITE_API_URL is not set*: add it under
   **Hosting → Environment variables**, then redeploy.
6. Click the URL, e.g. `https://main.d1a2b3c4.amplifyapp.com`, and write it in your worksheet.

> **Important: Vite reads `VITE_API_URL` at BUILD time.** If you add or change the variable later
> (**Hosting → Environment variables**), you must **redeploy** for it to take effect.
> To redeploy, open the `main` branch and choose **Redeploy this version**, or push a new commit.

✅ **Checkpoint:** the Amplify site loads and the top bar is green: **API ✓ Database ✓**, showing your API URL.

---

## 11. Lock down CORS

Right now the API accepts requests from **any** website (because `CORS_ORIGIN` is empty).
Let's allow only your Amplify site. On the EC2 server:

```bash
cd ~/task-manager-backend
nano .env
```
```ini
CORS_ORIGIN=https://main.d1a2b3c4.amplifyapp.com
```
(Your Amplify URL: starts with `https://`, **no trailing slash**.) Save, then:
```bash
pm2 restart task-api
```

✅ **Checkpoint:** refresh the Amplify site: still green. Browsers now refuse to let any other
website call your API. That's what we want.

---

## 12. Test everything end to end

1. On the Amplify site: add a task with a due date, change its status, filter by status, edit it, delete one.
2. Refresh the page (F5). Your tasks are still there, so they're stored in RDS, not in the browser.
3. Look at the data directly in the database from the EC2 server (use your own RDS endpoint):
   ```bash
   mysql -h task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com -u admin -p taskmanager -e "SELECT id, title, status, due_date FROM tasks;"
   ```
4. Reboot the server and confirm the API comes back by itself:
   ```bash
   sudo reboot
   ```
   Wait 1 minute, then refresh the Amplify site. It should be green again (thanks to `pm2 startup` + `pm2 save`).
5. Open the site on your phone. It's on the internet now! 🎉

---

## 13. Ship an update

Real apps change all the time. Practice the update flow for each part:

**Frontend (automatic):** on your computer, edit e.g. the subtitle in `src/App.jsx`, then
```bash
git add .
git commit -m "Change subtitle"
git push
```
Amplify notices the push and rebuilds automatically. Watch the build in the Amplify console.

**Backend (manual):** after pushing a backend change to GitHub, on the EC2 server:
```bash
cd ~/task-manager-backend
git pull
npm ci --omit=dev
pm2 restart task-api
```

**Database change:** for a new column, run an `ALTER TABLE` statement with the `mysql` client (see bonus challenge 1).

---

## 14. Troubleshooting

**Where to look first**
- The **top bar** of the website tells you which layer is broken (API or database) and gives a hint.
- On EC2: `curl http://localhost:3000/api/health` shows the database error `code` and a `hint`.
- Browser **DevTools** (F12) → **Console** and **Network** tabs.
- On EC2: `pm2 logs task-api` and `sudo tail -n 50 /var/log/nginx/error.log`.
- Amplify console → your app → the build → **Build logs** (the log prints `VITE_API_URL=...`).

| Symptom | Likely cause | Fix |
|---|---|---|
| Amplify build fails: *VITE_API_URL is not set* | The environment variable is missing | Add it in **Hosting → Environment variables**, then **redeploy** |
| Site: *… is not the Task Manager API* | `VITE_API_URL` points at the wrong address (e.g. ends with `/api`) | Use just `https://<your-host>.sslip.io`, then redeploy |
| Site shows the *mixed content* hint | `VITE_API_URL` starts with `http://` | Use the `https://` address, then redeploy |
| DevTools console: *blocked by CORS policy* | `CORS_ORIGIN` doesn't exactly match the Amplify URL | Set it to the exact URL (https, no trailing slash) and run `pm2 restart task-api` |
| *API ✓ Database ✗* with `ETIMEDOUT` | EC2 can't reach RDS on port 3306 | `task-db-sg` must allow 3306 from **`task-api-sg`**; RDS and EC2 must be in the same VPC/region |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` | Fix `.env`, then `pm2 restart task-api` |
| `ER_BAD_DB_ERROR` | Database `taskmanager` doesn't exist | Run `npm run db:init` (it creates it), check `DB_NAME` |
| `ER_NO_SUCH_TABLE` | Table not created yet | `npm run db:init` |
| `ENOTFOUND` | `DB_HOST` has a typo | Copy the endpoint again from the RDS console |
| `HANDSHAKE_SSL_ERROR` | `DB_SSL` setting doesn't match the server | Use `DB_SSL=true` for RDS, `DB_SSL=false` for a local MySQL |
| Site: *did not answer within 15 seconds* | Port 443 blocked, or the instance is stopped | `task-api-sg` must allow HTTPS 443 from anywhere; check the instance is *Running* |
| `502 Bad Gateway` from Nginx | Node.js isn't running | `pm2 status`, `pm2 logs task-api`; fix the error, `pm2 restart task-api` |
| `curl http://localhost:3000` fails, `pm2 status` shows *errored* | Crash on start, often a bad `.env` | `pm2 logs task-api --lines 50` |
| Certbot fails: *Timeout during connect* | Port 80 isn't reachable | `task-api-sg` must allow HTTP 80 from anywhere; check that Nginx is running |
| Certbot: *too many certificates already issued for sslip.io* | Let's Encrypt rate limit (shared by many users) | Use `nip.io` instead: `export API_HOST=13-250-1-2.nip.io`, update the `API_HOST` line in `~/.bashrc`, redo Steps 9b–9c, then set `VITE_API_URL` to the new https address and redeploy Amplify |
| SSH: *Connection timed out* | Your IP changed (new Wi-Fi) | Edit the SSH rule in `task-api-sg` → Source *My IP* again |
| SSH: *UNPROTECTED PRIVATE KEY FILE* | Key file permissions too open | Mac/Linux: `chmod 400 task-key.pem`. Windows PowerShell: `icacls .\task-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"`. Or use EC2 Instance Connect |
| API doesn't come back after reboot | PM2 startup not saved | Run `pm2 startup` (+ the printed command) and `pm2 save` |
| Amplify build fails at `npm ci` | `package-lock.json` missing from GitHub | Commit and push `package-lock.json` |
| `nginx -t` fails | Typo in the config file | `sudo nano /etc/nginx/sites-available/task-api` |

---

## 15. Clean up: don't skip this!

Delete things in this order:

1. **Amplify:** your app → **App settings → General settings** → **Delete app**.
2. **EC2:** **Instances** → select `task-api-server` → **Instance state → Terminate**.
3. **Elastic IP:** **Elastic IPs** → select it → **Actions → Release Elastic IP addresses**.
   ⚠️ An Elastic IP you keep still costs money, even when it isn't attached to anything.
4. **RDS:** **Databases** → select `task-db` → **Actions → Delete** → uncheck *Create final snapshot*,
   uncheck *Retain automated backups*, tick the acknowledgement, type `delete me` → **Delete**.
5. **Security groups:** once the instance and database are gone, delete `task-db-sg` first, then `task-api-sg`.
6. **Key pair:** **Key Pairs** → delete `task-key` (and the `.pem` file on your computer).
7. The next day, check **Billing and Cost Management** to confirm nothing is still running.

---

## 16. Check your understanding and bonus challenges

### Questions
1. Why can't the browser connect to RDS directly? What would happen if `task-db-sg` allowed 3306 from `0.0.0.0/0`?
2. Why does the backend need HTTPS even though the frontend already has it?
3. What does Nginx do that Node.js could also do, and why do we still put Nginx in front?
4. `VITE_API_URL` is set in Amplify, but `CORS_ORIGIN` is set on EC2. Why does each live where it does?
5. What would break if you didn't attach an Elastic IP and the instance was stopped and started?
6. What does PM2 give you that `node src/server.js` doesn't?

### Bonus challenges
1. **Add a "priority" field** (low / medium / high) through every layer:
   `ALTER TABLE tasks ADD COLUMN priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium';`
   → update `src/validation.js` and the SQL in `src/routes/tasks.js` → add a select to `TaskForm.jsx`
   and show it in `TaskItem.jsx` → deploy both.
2. **Search:** add `GET /api/tasks?q=word` that searches titles with `LIKE`, plus a search box.
3. **Least privilege:** create a MySQL user that can only use the `taskmanager` database
   (`CREATE USER ...; GRANT SELECT, INSERT, UPDATE, DELETE ON taskmanager.* TO ...;`) and use it in `.env` instead of `admin`.
4. **Secrets:** store `DB_PASSWORD` in AWS Systems Manager Parameter Store and load it at startup with an IAM role.
5. **Auto-deploy the backend:** a GitHub Actions workflow that SSHes into EC2 and runs the update commands from Step 13.
6. **Custom domain:** buy a domain (or use one you have), point it at Amplify and at the Elastic IP with Route 53.
7. **Monitoring:** create a CloudWatch alarm that emails you when the EC2 CPU is above 80% for 5 minutes.
