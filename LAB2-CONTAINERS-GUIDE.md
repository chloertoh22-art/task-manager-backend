# Lab 2: Run the API in a Container on AWS
### Docker · Amazon ECR · Amazon ECS Express Mode (Fargate) · RDS · Amplify: a hands-on student guide

In Lab 1 you ran the API on an EC2 server that you set up by hand: Node.js, PM2, Nginx and certbot.
In this lab you package the same API into a **container image** and let **Amazon ECS** run it
for you. AWS starts it, restarts it when it crashes, spreads it over two data centers, gives it
an HTTPS address and scales it. The React website stays on **Amplify**, and the database stays on **RDS**.

**Time needed:** about 2–3 hours  
**Level:** intermediate. Finish Lab 1 first: this guide assumes you know RDS, security groups and Amplify.

---

## Table of contents

0. [The big picture](#0-the-big-picture)
1. [Before you start](#1-before-you-start)
2. [Containers in 5 minutes](#2-containers-in-5-minutes)
3. [What changed in the code](#3-what-changed-in-the-code)
4. [Run everything on your laptop with Docker (optional)](#4-run-everything-on-your-laptop-with-docker-optional)
5. [Push the updated code to GitHub](#5-push-the-updated-code-to-github)
6. [Create the security groups](#6-create-the-security-groups)
7. [Create the MySQL database on RDS](#7-create-the-mysql-database-on-rds)
8. [Store the database password in Parameter Store](#8-store-the-database-password-in-parameter-store)
9. [Create the task execution role](#9-create-the-task-execution-role)
10. [Build the image and push it to ECR](#10-build-the-image-and-push-it-to-ecr)
11. [Run the container with ECS Express Mode](#11-run-the-container-with-ecs-express-mode)
12. [Connect the Amplify frontend](#12-connect-the-amplify-frontend)
13. [Lock down CORS](#13-lock-down-cors)
14. [See what containers give you](#14-see-what-containers-give-you)
15. [Ship version 2](#15-ship-version-2)
16. [Troubleshooting](#16-troubleshooting)
17. [Clean up: don't skip this!](#17-clean-up-dont-skip-this)
18. [Check your understanding and bonus challenges](#18-check-your-understanding-and-bonus-challenges)

---

## 0. The big picture

```
   Your browser
       │ 1. https://main.d1a2b3c4.amplifyapp.com                (React website, same as Lab 1)
       ▼
 ┌──────────────┐
 │ AWS Amplify  │
 └──────────────┘
       │ 2. The website calls the API: https://task-api-xxxx.ecs.ap-southeast-1.on.aws/api/tasks
       ▼
 ┌──────────────────────── Default VPC (Express Mode creates all of this) ───────────────────────┐
 │  Application Load Balancer (HTTPS + free certificate)                                         │
 │        │                                                                                      │
 │        ▼                                                                                      │
 │  ECS service "task-api" on Fargate: 1–2 containers in different Availability Zones           │
 │        │  port 3306 (only containers with task-api-sg may connect)                            │
 │        ▼                                                                                      │
 │  RDS MySQL (private)                                                                          │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ pulls the image from                   ▲ reads DB_PASSWORD from
   Amazon ECR (task-api:v1)              Systems Manager Parameter Store
        ▲ docker push
   AWS CloudShell (docker build)
```

### What's different from Lab 1

| Lab 1 (EC2) | Lab 2 (container) |
|---|---|
| You launch and set up an EC2 server | **Fargate** runs your container; there is no server to manage |
| Nginx + certbot + sslip.io for HTTPS | **Express Mode** creates a load balancer with an HTTPS address and certificate |
| PM2 restarts the app | **ECS** replaces a stopped or unhealthy container automatically |
| One server | 1–2 containers in different **Availability Zones**, with auto scaling |
| Code arrives with `git pull` | Code is baked into an **image** stored in **ECR** |
| Password in a `.env` file on the server | Password in **Parameter Store**, injected when the container starts |
| `pm2 logs` | **CloudWatch Logs** |

### New AWS words

| Word | Meaning |
|---|---|
| **Image** | A packaged app: code + Node.js + dependencies, ready to run anywhere |
| **Container** | A running copy of an image |
| **ECR** (Elastic Container Registry) | Private storage for your images, like GitHub for images |
| **ECS** (Elastic Container Service) | AWS's service that runs and looks after containers |
| **Fargate** | Runs containers without you managing servers. You pay per vCPU and GB per hour |
| **Task** | One running container in ECS |
| **Service** | Keeps a number of tasks running, replaces failed ones, connects them to the load balancer |
| **Express Mode** | A simple way to create an ECS service: it also creates the load balancer, HTTPS, scaling and logs |
| **Parameter Store** | Part of AWS Systems Manager. Stores settings and secrets, encrypted |

### Cost (Asia Pacific (Singapore), on-demand prices)

| Resource | Price | Per hour |
|---|---|---|
| Application Load Balancer | $0.0252/hour + about $0.008 for light traffic | ~$0.033 |
| Public IPv4 addresses (load balancer, ~3) | $0.005 each per hour | ~$0.015 |
| Fargate task: 0.25 vCPU + 0.5 GB | $0.05056 per vCPU-hour + $0.00553 per GB-hour | ~$0.015 per task |
| Public IPv4 address per task | $0.005 per hour | $0.005 per task |
| RDS `db.t4g.micro` | $0.025/hour (+ a little for storage) | ~$0.029 |
| ECR, Parameter Store (standard), logs | Tiny amounts, or free | ~$0 |

**Total ≈ US$0.10 per hour with 1 task (≈ $0.12 with 2).** A 3-hour lab costs about $0.35, which
new-account Free Tier credits cover. Left running for a whole day it's about $2.50–3, so **do [Step 17](#17-clean-up-dont-skip-this)**.

> The console's default container size is 1 vCPU + 2 GB, which costs 4× more per task than the 0.25 vCPU + 0.5 GB
> we choose in Step 11. Our small API doesn't need more.

---

## 1. Before you start

### You need
- An **AWS account** and a **GitHub account** (the same as Lab 1)
- The updated **`task-manager-backend`** and **`task-manager-frontend`** code (from your instructor)
- A web browser. All AWS steps use the console and **AWS CloudShell**, so you don't need Docker or
  AWS credentials on your laptop.
- *Optional, for Step 4:* **Docker Desktop** on your laptop ([docker.com](https://www.docker.com/products/docker-desktop/))

### Pick ONE region: Asia Pacific (Singapore) `ap-southeast-1`
Create everything in the same region. CloudShell's Docker feature, used in Step 10, works in Singapore.

> **Lab 1 leftovers:** if you still have Lab 1 resources with the same names (`task-api-sg`, `task-db-sg`, `task-db`),
> clean them up first (Lab 1, Step 15), or add `-lab2` to every name in this guide.
> **Sharing one AWS account?** Add your name to every name (e.g. `ali-task-api`, `ali-task-db-sg`). For the parameter,
> **keep the `/task-manager/` prefix** and put your name after it (`/task-manager/ali/db-password`). In Step 9's policy,
> use your parameter's exact ARN instead of `*`, so classmates' roles can't read your password.

### Your worksheet: fill this in as you go

| Item | Your value |
|---|---|
| AWS account ID (12 digits) | |
| RDS endpoint | |
| Parameter ARN (`/task-manager/db-password`) | |
| ECR image URI (`…/task-api:v1`) | |
| API URL (`https://task-api-….on.aws`) | |
| Amplify app URL | |

> Your **account ID** is in the top-right account menu of the AWS console.

---

## 2. Containers in 5 minutes

Without containers, every computer that runs the API needs the right Node.js version, the right
packages and the right settings. "It works on my machine" becomes a problem. A **container image** bundles the
app **with** everything it needs, so it runs the same way on your laptop, in CloudShell and on AWS.

The recipe for an image is the **`Dockerfile`** in `task-manager-backend`:

```dockerfile
# Start from a small Linux image that already has Node.js 24
FROM node:24-alpine
ENV NODE_ENV=production
# Work inside /app in the image
WORKDIR /app

# Install only the production packages
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the app code
COPY src ./src
COPY db ./db
COPY certs ./certs

# Don't run as root (safer)
USER node
# The API listens on port 3000
EXPOSE 3000
# The command that starts the container
CMD ["node", "src/server.js"]
```
(In a Dockerfile, a comment must be on its own line, starting with `#`.)

The basic commands:

| Command | What it does |
|---|---|
| `docker build -t task-api .` | Build an image from the Dockerfile in this folder |
| `docker images` | List images |
| `docker run -p 3000:3000 task-api` | Start a container; port 3000 on your computer goes to port 3000 inside it |
| `docker ps` | List running containers |
| `docker logs <id>` | Show a container's output |
| `docker stop <id>` | Stop it (the app receives a SIGTERM signal and shuts down cleanly) |
| `docker push <uri>` | Upload an image to a registry such as ECR |

---

## 3. What changed in the code

The **frontend didn't change**, apart from a more general tip in its connection bar.
In **`task-manager-backend`** you'll find these new or changed files:

| File | What it does |
|---|---|
| `Dockerfile` | The recipe for the image (above) |
| `.dockerignore` | Keeps `node_modules`, `.env`, tests and other unneeded files out of the image |
| `docker-compose.yml` | Starts MySQL + the API together on your laptop (Step 4) |
| `src/setup-db.js` | Creates the database, table and sample tasks. It's now used by `npm run db:init` **and** by the server at startup |
| `src/startup.js` | Retry timing, and a config summary for the logs that never prints the password |
| `src/server.js` | Sets up the database automatically with retries, and shuts down cleanly |
| `src/routes/health.js` | Also checks the `tasks` table, and reports which container answered (`server`) |
| `src/app.js` | `GET /` now also shows a `version` number (you change it in Step 15) |
| `db/init.js`, `src/db.js` | `db:init` now reuses `src/setup-db.js`; clearer error hints |
| `test/*.test.js`, `README.md` | Tests and documentation for the new code |

### Automatic database setup with retries (`src/server.js`)
On EC2 you ran `npm run db:init` yourself. A container should prepare what it needs by itself,
so the server now does this at startup. If the database isn't reachable yet (it's still
starting, or a firewall rule is missing), the API **keeps running** and retries after 5, 10, 20 and then every 30 seconds (simplified):

```js
async function prepareDatabase(attempt = 1) {
  try {
    await setupDatabase();
  } catch (err) {
    const delay = retryDelayMs(attempt);
    console.error(`❌ Database setup failed (attempt ${attempt}): ${err.code || ''} ${err.message}`);
    console.error(`   Hint: ${explainDbError(err)}`);
    console.error(`   Retrying in ${delay / 1000} seconds...`);
    setTimeout(() => prepareDatabase(attempt + 1), delay).unref();
  }
}
```
So when you fix a mistake (e.g. a security group rule), the app **heals itself**: no restart is needed.
`setupDatabase()` takes a MySQL lock (`GET_LOCK`), so two containers starting at the same time
don't both insert the sample tasks.

### Clean shutdown (`src/server.js`)
ECS stops a container by sending it a **SIGTERM** signal (during deployments, scale-in, or when you stop a task).
The app finishes the requests it's handling, closes its database connections, and exits:

```js
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

### Logs that help you debug
The first log line shows the configuration the container received. The password is never shown,
only whether one was provided:
```
Starting Task Manager API. Config: PORT=3000  DB_HOST=task-db.abc…rds.amazonaws.com  DB_PORT=3306  DB_USER=admin  DB_NAME=taskmanager  DB_SSL=true  DB_PASSWORD=(set)  CORS_ORIGIN=(any website)
```

### Two kinds of health check
- **`/`** answers as long as the Node.js process is alive. The **load balancer** uses this to decide whether a container is healthy.
- **`/api/health`** also checks the database. **You** use this to debug.

If the load balancer used `/api/health`, a database problem would make ECS replace every container
again and again, and you'd lose the logs and hints you need to find the problem.

---

## 4. Run everything on your laptop with Docker (optional)

Skip this step if you don't have Docker Desktop. Step 10 builds the image in CloudShell instead.

Start Docker Desktop, then:
```bash
cd task-manager-backend
docker compose up --build
```
Docker builds the API image, starts **MySQL 8.4** and the **API** in two containers, and connects them on a
private network. In the API's output, look for:
```
Task Manager API listening on port 3000
✅ Database "taskmanager" and table "tasks" are ready.
✅ Added 3 sample tasks.
```
Open <http://localhost:3000/api/health>. In a second terminal, run the frontend as in Lab 1
(`npm run dev` in `task-manager-frontend`, with `VITE_API_URL=http://localhost:3000` in `.env.local`).

**Try this:** watch the API heal itself.
```bash
docker compose stop db        # the database "breaks"
```
Refresh <http://localhost:3000/api/health>: it now shows a database error. Then:
```bash
docker compose start db       # the database comes back
```
After a few seconds `/api/health` shows `"database":"ok"` again, without restarting the API.

Stop everything with **Ctrl+C**, then `docker compose down`. (`docker compose down -v` also deletes the database data.)

> **Mac with Apple silicon (M1/M2/M3/M4)?** Your laptop builds **ARM** images, but Fargate runs **x86** by default.
> An ARM image fails there with `exec format error`. When you build an image for AWS, always add
> `--platform linux/amd64` (Step 10 does this for you).

✅ **Checkpoint:** the API runs in a container and `/api/health` shows `"database":"ok"`.

---

## 5. Push the updated code to GitHub

CloudShell will `git clone` your backend from GitHub.

**If you still have your Lab 1 repositories:** copy **everything** from the updated `task-manager-backend` folder over
your local repository folder, replacing the old files. Include the hidden files such as `.dockerignore`:
on a Mac, press **Cmd+Shift+.** in Finder to show them; on Windows, turn on **View → Show → Hidden items** in File Explorer.
Don't copy a `node_modules` folder. Then:
```bash
cd task-manager-backend
git add .
git commit -m "Add Docker support for Lab 2"
git push
```
Do the same for `task-manager-frontend`. It only has one small change, and Amplify rebuilds it automatically.

**If you're starting fresh:** create the two GitHub repositories and push them as in Lab 1, Step 3.

✅ **Checkpoint:** your `task-manager-backend` repository on GitHub shows a `Dockerfile`.

---

## 6. Create the security groups

| Name | Attached to | Inbound rules |
|---|---|---|
| `task-api-sg` | The API containers | TCP **3000** from **inside the VPC** (`172.31.0.0/16`), so the load balancer can reach the containers. The internet can't. |
| `task-db-sg` | RDS | MySQL (3306) **only from `task-api-sg`** |

1. **EC2** console → **Security Groups** → **Create security group**:
   **Name** `task-api-sg`, **Description** `Task API containers`, **VPC** default.
   **Inbound rules → Add rule:** Type **Custom TCP**, Port range **3000**, Source **Custom** `172.31.0.0/16`,
   Description `Load balancer to API`. → **Create**.
2. **Create security group** again: **Name** `task-db-sg`, **Description** `Task database`, **VPC** default.
   **Inbound rules → Add rule:** Type **MYSQL/Aurora**, Source **Custom** → select **`task-api-sg`** → **Create**.

> **Why our own `task-api-sg`?** Express Mode also creates a security group for the service, but it deletes that
> group when you delete the service. If RDS's rule pointed at it, the deletion would fail, because a security group that
> another rule refers to can't be deleted. Our own group avoids that.

> `172.31.0.0/16` is the address range of every account's **default VPC**. The load balancer lives inside it, so this rule lets
> it reach your containers on port 3000, while nobody on the internet can.

✅ **Checkpoint:** `task-api-sg` allows port 3000 from `172.31.0.0/16`, and `task-db-sg` allows port 3306 from `task-api-sg`.

---

## 7. Create the MySQL database on RDS

This is almost the same as Lab 1, Step 5. Start it now: it takes 5–10 minutes.

1. **RDS** console → **Create database** → **Standard create** → **MySQL**.
2. **Templates:** **Free tier** (or **Sandbox** if that's what you see).
3. **DB instance identifier** `task-db` · **Master username** `admin` · **Credentials management:** **Self managed** ·
   **Master password:** letters and numbers only (e.g. `TaskDb2026xyzABC`). Keep a temporary copy: you'll store it in
   Parameter Store in Step 8, then you can delete your copy.
4. **Instance:** `db.t4g.micro` (or `db.t3.micro`). **Storage:** 20 GiB; uncheck *Enable storage autoscaling*.
5. **Connectivity:** *Don't connect to an EC2 compute resource* · default VPC · **Public access: No** ·
   **VPC security group:** *Choose existing* → remove `default` → select **`task-db-sg`**.
6. **Additional configuration:** **Initial database name** `taskmanager` · **Deletion protection** unchecked.
7. **Create database**. When it's **Available**, copy the **Endpoint** into your worksheet.

✅ **Checkpoint:** `task-db` is **Available** and its security group is `task-db-sg`.

---

## 8. Store the database password in Parameter Store

In Lab 1 the password sat in a `.env` file on the server. Now it lives, encrypted, in **Parameter Store**.
ECS reads it and gives it to the container as the environment variable `DB_PASSWORD`.
It never appears in your code, your image or the ECS console.

1. Search for **Systems Manager** → left menu **Parameter Store** → **Create parameter**.
2. **Name:** `/task-manager/db-password`
3. **Tier:** Standard (free) · **Type:** **SecureString** · **KMS key source:** *My current account* · **KMS key ID:** `alias/aws/ssm` (the default)
4. **Value:** your RDS master password → **Create parameter**.
5. Write down the parameter's **ARN**. It has this format (use your region and account ID):
   ```
   arn:aws:ssm:ap-southeast-1:123456789012:parameter/task-manager/db-password
   ```

✅ **Checkpoint:** the parameter exists with type **SecureString**.

---

## 9. Create the task execution role

ECS itself needs permission to **pull your image** from ECR, **write logs** and **read the password**
when it starts a container. That permission comes from the **task execution role**.

> **Execution role vs task role:** the *execution role* is used by **ECS** to start the container (pull image, read secrets,
> write logs). A *task role* would be used by **your code** to call AWS services (e.g. S3). Our API doesn't call
> any AWS services, so it doesn't need a task role.

1. **IAM** console → **Roles** → **Create role**.
2. **Trusted entity type:** AWS service · **Service or use case:** **Elastic Container Service** · **Use case:**
   **Elastic Container Service Task** → **Next**.
3. Search for and tick **`AmazonECSTaskExecutionRolePolicy`** → **Next**.
4. **Role name:** `taskApiExecutionRole` → **Create role**.
5. Open `taskApiExecutionRole` → **Add permissions** → **Create inline policy** → **JSON**, and paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ssm:GetParameters",
         "Resource": "arn:aws:ssm:*:*:parameter/task-manager/*"
       }
     ]
   }
   ```
   → **Next** → **Policy name** `read-task-manager-parameters` → **Create policy**.

> The policy allows reading only the parameters under `/task-manager/`, nothing else. This is the
> principle of **least privilege**. No `kms:Decrypt` permission is needed because the parameter uses
> the default `aws/ssm` key.

✅ **Checkpoint:** `taskApiExecutionRole` has 2 permission policies: `AmazonECSTaskExecutionRolePolicy` and `read-task-manager-parameters`.

---

## 10. Build the image and push it to ECR

### 10a. Create the ECR repository
**ECR** console (*Elastic Container Registry*) → **Private registry → Repositories** → **Create repository** →
**Repository name** `task-api` → **Create**.

### 10b. Open AWS CloudShell
Click the **CloudShell** icon (**>_**) in the top bar of the AWS console. Check that the console region is **Singapore**.
CloudShell is a Linux terminal in your browser. You're already signed in, and Docker, Git and the
AWS CLI are installed.

### 10c. Build and push
Paste these commands one block at a time (replace `YOUR-USERNAME`):
```bash
git clone https://github.com/YOUR-USERNAME/task-manager-backend.git
cd task-manager-backend
```
```bash
# Remember the values we need, also for future CloudShell sessions
export AWS_REGION=ap-southeast-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGISTRY=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
export REPO=$REGISTRY/task-api
cat >> ~/.bashrc <<EOF
export AWS_REGION=$AWS_REGION ACCOUNT_ID=$ACCOUNT_ID REGISTRY=$REGISTRY REPO=$REPO
EOF
echo $REPO        # e.g. 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/task-api
```
```bash
# Build the image for x86 (what Fargate runs) and tag it as version 1
docker build --platform linux/amd64 -t $REPO:v1 .
docker images
```
```bash
# Log Docker in to your ECR registry, then upload the image
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY
docker push $REPO:v1
```

**Optional:** test the image in CloudShell before deploying it:
```bash
docker run -d --rm --name test -p 3000:3000 -e DB_HOST=nowhere $REPO:v1
sleep 3
curl localhost:3000/              # {"name":"Task Manager API",...}: the container works
docker logs test                  # see the config line and the "database setup failed ... retrying" messages
docker stop test
```

> **Using your laptop instead?** It works the same way with Docker Desktop and AWS CLI **2.32 or newer**. Sign in once with
> `aws login`, then run the commands above in Terminal (Mac/Linux) or **Git Bash** (Windows).
> The `--platform linux/amd64` flag is essential on Apple silicon Macs.

✅ **Checkpoint:** in the ECR console, the `task-api` repository shows an image with tag **v1**. Copy its **URI** into your worksheet.

---

## 11. Run the container with ECS Express Mode

1. **ECS** console (*Elastic Container Service*) → left menu **Express mode**.
2. **Image URI:** **Browse ECR images** → repository `task-api` → **Select image by:** *Image tag* → `v1`.
3. **Task execution role:** **`taskApiExecutionRole`**.
4. **Infrastructure role:** if this is your first time, choose **Create new role**; otherwise select the existing one.
   (Express Mode uses this role to create the load balancer, certificate, security group and scaling for you.)
5. Open **Additional configurations**:

   **Service**
   - **Name:** `task-api`

   **Container**
   - **Container port:** `3000`
   - **Health check path:** `/`
   - **Environment variables:** add these with **Add environment variable** (use your RDS endpoint):

     | Key | Value type | Value or value from |
     |---|---|---|
     | `DB_HOST` | Environment variable | `task-db.abc123xyz.ap-southeast-1.rds.amazonaws.com` |
     | `DB_USER` | Environment variable | `admin` |
     | `DB_NAME` | Environment variable | `taskmanager` |
     | `DB_SSL` | Environment variable | `true` |
     | `DB_PASSWORD` | **Secret** | your parameter **ARN** from Step 8 |

   **Compute**
   - **CPU:** `0.25 vCPU` · **Memory:** `0.5 GB` · **CPU architecture:** `X86_64`

   **Auto scaling**
   - **Minimum number of tasks:** `1` · **Maximum number of tasks:** `2` (keep the CPU target at 60)

   **Networking:** tick **Customize networking configurations**
   - **VPC:** the default VPC · **Subnets:** select **all** of its subnets
   - **Security groups:** add **`task-api-sg`**

6. **Create**.

> If you see *Unable to assume the service linked role*, wait 30 seconds and click **Create** again. This sometimes happens the first time.

Express Mode now creates the ECS cluster, the service, an Application Load Balancer with an HTTPS
listener and a free certificate, the auto scaling and a CloudWatch log group. This takes **5–10 minutes**.

### Watch it start
Open the service (**Clusters** → `default` → **Services** → `task-api`; it has an **Express** badge):
- **Tasks** tab: the task goes from *Provisioning* to *Pending* to **Running**.
- **Logs** tab: you should see
  ```
  Starting Task Manager API. Config: ... DB_SSL=true  DB_PASSWORD=(set) ...
  Task Manager API listening on port 3000
  ✅ Database "taskmanager" and table "tasks" are ready.
  ✅ Added 3 sample tasks.
  ```
- When the service is ready, copy the **Application URL** (`https://task-api-….ecs.ap-southeast-1.on.aws`) into your worksheet.

Open `<your API URL>/api/health` in your browser.

✅ **Checkpoint:** you see `"database":"ok"` and a `"server"` value: that's the name of the container that answered.
There's a padlock 🔒 even though you never ran certbot: Express Mode created the certificate.

---

## 12. Connect the Amplify frontend

The website needs the new API address.

**If your Lab 1 Amplify app still exists:**
1. **Amplify** console → your app → **Hosting → Environment variables** → **Manage variables**.
2. Change **`VITE_API_URL`** to your **API URL** (no trailing `/`) → **Save**.
3. **Redeploy:** open the `main` branch → **Redeploy this version**. (Vite bakes the URL in at build time.)

**If you deleted it:** create it again as in Lab 1, Step 10, with `VITE_API_URL` = your API URL.

✅ **Checkpoint:** the Amplify site shows **API ✓ Database ✓** with your `…ecs…on.aws` address, and you can add tasks.

---

## 13. Lock down CORS

Allow only your Amplify site to call the API:
1. Open the `task-api` service → **Update**.
2. **Additional configurations → Environment variables → Add environment variable:**
   `CORS_ORIGIN` · Environment variable · `https://main.d1a2b3c4.amplifyapp.com` (your Amplify URL, no trailing `/`).
3. **Update**.

Every update starts a **new deployment**. ECS starts containers with the new settings, sends traffic to them, and
then stops the old ones. With Express Mode the switch is a gradual *canary* deployment, rolled back automatically if errors
appear. Watch it in the service's **Deployments** tab. It takes **several minutes**, and your site stays online the whole time.

✅ **Checkpoint:** when the deployment finishes, the Logs show `CORS_ORIGIN=https://main…amplifyapp.com` and the site is still green.

---

## 14. See what containers give you

### 14a. Self-healing
1. Service → **Tasks** tab → tick the running task → **Stop** → **Stop selected**.
2. Refresh the Amplify site: it can't reach the API (with only one task, nothing is left to answer).
3. Watch the **Tasks** tab: ECS notices that a task is missing and starts a new one **by itself**.
   The load balancer only sends traffic to a new container after it passes 5 health checks, 30 seconds apart,
   so the site is back after **about 3–5 minutes**.

### 14b. Two containers in two Availability Zones
1. Service → **Update** → **Auto scaling → Minimum number of tasks:** `2` → **Update**.
2. Wait until **both** tasks are *Running* **and** their **Health status** is *Healthy* (about 3–5 minutes). Then run this in
   CloudShell (use your API URL):
   ```bash
   for i in 1 2 3 4 5 6; do curl -s https://task-api-xxxx.ecs.ap-southeast-1.on.aws/api/health; echo; done
   ```
   The `"server"` value changes: the load balancer spreads requests over both containers.
3. Now stop **one** task as in 14a. The site **stays online**, because the other container keeps answering.
   This is why production systems run at least two copies.

### 14c. Logs
**CloudWatch** → **Log groups** → the group named after your service. Every container writes there,
even containers that no longer exist. Search for `❌` to find errors.

✅ **Checkpoint:** you saw ECS replace a stopped task, and requests answered by two different `server` names.

> **Save money:** when you're done with 14b, set the minimum back to `1`.

---

## 15. Ship version 2

Releasing a new version: change the code, build a new image with a new tag, and point the service at it.

1. On your laptop, open `task-manager-backend/src/app.js` and change the version number:
   ```js
   version: 2,
   ```
   Commit and push:
   ```bash
   git add .
   git commit -m "Version 2"
   git push
   ```
2. In CloudShell (the `export` values were saved in Step 10, so they're still there):
   ```bash
   cd ~/task-manager-backend
   git pull
   docker build --platform linux/amd64 -t $REPO:v2 .
   aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY
   docker push $REPO:v2
   ```
3. Service → **Update** → **Image URI:** *Browse ECR images* → `task-api` → tag **v2** → **Update**.
4. When the deployment finishes (several minutes), open `<your API URL>/`. It shows `"version":2`.

**Rollback:** made a mistake? **Update** the service back to tag **v1**. The old image is still in ECR.
This is a big advantage of images with version tags.

✅ **Checkpoint:** `<your API URL>/` shows `"version":2`, and ECR lists tags `v1` and `v2`.

---

## 16. Troubleshooting

**Where to look first**
- The **top bar** of the website, and `<your API URL>/api/health` (it shows a database error `code` and a `hint`).
- Service → **Logs** tab: the first line shows the configuration the container received.
- Service → **Events** / **Deployments** tabs: why tasks failed or why a deployment was rolled back.
- Service → **Tasks** tab → a **Stopped** task → **Stopped reason**.

| Symptom | Likely cause | Fix |
|---|---|---|
| Create fails: *Unable to assume the service linked role* | First-time setup | Wait 30 seconds, click **Create** again |
| Task stopped: *CannotPullContainerError* | Wrong image URI or tag, or the image wasn't pushed | Check the ECR repository shows the tag; select the image with **Browse ECR images** |
| Logs show *exec format error* | Image built for ARM (Apple silicon Mac) | Rebuild with `--platform linux/amd64`, push, update the service |
| Task stopped: *ResourceInitializationError … ssm* / *unable to pull secrets* | Execution role can't read the parameter, or the ARN is wrong | Check Step 9's inline policy, and the parameter ARN/region in `DB_PASSWORD` |
| Logs: `DB_PASSWORD=(NOT SET)` | The secret wasn't added | Update the service: add `DB_PASSWORD` with value type **Secret** |
| Logs: `ETIMEDOUT` | The container can't reach RDS | `task-db-sg` must allow 3306 from **`task-api-sg`**, and the service must have `task-api-sg` (Step 11, Networking) |
| Logs: `ER_ACCESS_DENIED_ERROR` | Wrong password or user | Fix the parameter value, then **stop the tasks**: secrets are read only when a task starts, and ECS starts fresh ones |
| Logs: `HANDSHAKE_SSL_ERROR` | `DB_SSL` setting | Use `DB_SSL=true` for RDS |
| Logs: `ER_SECURE_TRANSPORT_REQUIRED` | The database only accepts encrypted connections, and `DB_SSL` isn't `true` | Set `DB_SSL=true` |
| Logs: `ENOTFOUND` | Typo in `DB_HOST` | Copy the RDS endpoint again, update the service |
| URL shows *503 Service Temporarily Unavailable* | No healthy task yet (a new task needs ~3 minutes), or tasks keep crashing | Check **Tasks** and **Logs**; make sure **Container port** is `3000`, **Health check path** is `/`, and `task-api-sg` allows port 3000 from `172.31.0.0/16` |
| Deployment *rolled back* | New tasks failed health checks or caused errors | Read **Events**; fix the cause, update again |
| Site: *Cannot reach the API* / CORS error in the browser console (F12) | `CORS_ORIGIN` doesn't exactly match the Amplify URL | Update the service; use the exact URL, https, no trailing `/` |
| Site: *… is not the Task Manager API* | `VITE_API_URL` is wrong (e.g. ends with `/api`) | Fix it in Amplify, then redeploy |
| CloudShell: *no basic auth credentials* or *authorization token has expired* | Docker's ECR login expired (after 12 hours) | Run the `aws ecr get-login-password … docker login …` line again |
| CloudShell: *no space left on device* | Old images fill CloudShell's disk | `docker system prune -a` |
| CloudShell: `$REPO` is empty | The `export` lines weren't saved | Re-run the `export` block from Step 10c |

---

## 17. Clean up: don't skip this!

Delete things in this order:

1. **ECS service:** **Clusters** → `default` → **Services** → `task-api` → **Delete service**, then type `delete` to confirm.
   This also deletes the load balancer, certificate, Express Mode's security group, log group, alarms and scaling.
   The console lists anything it **kept**; delete those too (e.g. a log group in **CloudWatch → Log groups**).
   Wait until the service is gone (a few minutes).
2. **ECR:** **Repositories** → `task-api` → **Delete** (this also deletes the images).
3. **RDS:** `task-db` → **Actions → Delete** → uncheck *Create final snapshot* and *Retain automated backups* →
   tick the acknowledgement → type `delete me` → **Delete**.
4. **Parameter Store:** delete `/task-manager/db-password`.
5. **Security groups:** after the service and database are gone, delete `task-db-sg` first, then `task-api-sg`.
6. **IAM roles:** delete `taskApiExecutionRole`. You may also delete the Express Mode infrastructure role if you won't use Express Mode again.
7. **Amplify:** delete the app if you've finished both labs.
8. **ECS cluster:** an empty `default` cluster costs nothing. It may already be gone (Express Mode removes it when it's empty);
   if not, you can delete it (**Clusters** → `default` → **Delete cluster**).
9. The next day, check **Billing and Cost Management** to confirm nothing is still running.

---

## 18. Check your understanding and bonus challenges

### Questions
1. What's the difference between an **image** and a **container**? Where is your image stored?
2. Why do we build with `--platform linux/amd64`? What would you change to run on cheaper **ARM (Graviton)** containers instead?
3. What's the difference between the **task execution role** and a **task role**?
4. Why does the load balancer check `/` instead of `/api/health`?
5. Why does the API keep running, and retry, when the database isn't reachable?
6. What happened when you stopped a task with **one** running task, and with **two**?
7. Where did the HTTPS certificate come from? Compare it with Lab 1.
8. Where does the database password live, who can read it, and why is that better than a `.env` file on a server?
9. Lab 1 vs Lab 2: list 3 things that got easier and 1 thing that got harder or more expensive.

### Bonus challenges
1. **Graviton:** build with `--platform linux/arm64`, push as `v3-arm`, update the service with **CPU architecture ARM64**. Compare the Fargate prices.
2. **CI/CD:** write a GitHub Actions workflow that builds and pushes the image to ECR on every push to `main`,
   then updates the service. (Use an IAM role with GitHub's OIDC provider, not access keys.)
3. **Auto scaling:** lower the CPU target to 20%, generate load from CloudShell
   (e.g. a loop of `curl` commands in several terminals), and watch ECS add a second task.
4. **Containerise the frontend too:** a multi-stage `Dockerfile` that builds the React app with Node.js and serves `dist/` with nginx,
   deployed as a second Express Mode service.
5. **Least privilege:** create a MySQL user that can only use the `taskmanager` database
   (`CREATE USER …; GRANT SELECT, INSERT, UPDATE, DELETE ON taskmanager.* TO …;`), store its password in a second
   parameter, and run the container as that user instead of `admin`.
6. **Password rotation:** change the RDS password and the parameter, then stop the tasks so new ones pick up the new password,
   with no code change.
