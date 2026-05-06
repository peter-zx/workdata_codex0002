# Daily Log Tool

多人工作日志小工具。伙伴注册登录后，按条记录「工作内容、工作进度、复盘优化」，系统自动拼合为今日工作日志，并支持一键复制和年月周日视图回看。

## 本地启动

```powershell
Copy-Item .env.example .env
npm start
```

打开：

```text
http://localhost:3000
```

注册登录和数据隔离依赖服务端接口，请通过 HTTP 地址访问，不要用 `file://` 直接打开。

## 配置

配置通过环境变量或 `.env` 外置：

```text
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATA_DIR=./data
LOG_DIR=./logs
SESSION_COOKIE_NAME=daily_log_session
```

生产环境建议：

```text
DATA_DIR=/var/lib/workdata_codex0002
LOG_DIR=/var/log/workdata_codex0002
```

## 功能

- 支持注册、登录、退出。
- 每个账号只能看到自己的工作记录。
- 单条记录由工作内容、工作进度、复盘优化三个字段构成。
- 三个字段都不必填，但保存时至少要填写一项。
- 自动按日期归档，支持日、周、月、年视图。
- 生成「今日工作日志」文本，一键复制。
- 数据保存在服务端 `DATA_DIR`，密码使用加盐哈希保存。

## 目录结构

```text
public/       前端静态资源
src/          Node 服务端
deploy/       裸机部署、更新、回滚脚本
data/         本地开发数据，不提交
logs/         本地开发日志，不提交
.env.example  配置模板
```

## 生产部署模型

当前项目采用轻量裸机部署，但已经按后续 Docker 化思路做了边界隔离：

```text
/opt/workdata_codex0002/
  releases/
    20260506143000/
    20260506150000/
  current -> /opt/workdata_codex0002/releases/20260506150000
  runtime/
    node/

/var/lib/workdata_codex0002/   用户数据
/var/log/workdata_codex0002/   日志目录
```

systemd 服务永远指向：

```text
/opt/workdata_codex0002/current/src/server.js
```

这样每次更新都是新建 release，验证后切换 `current`，失败可回滚。

## 首次安装

从 GitHub 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/peter-zx/workdata_codex0002/main/deploy/bootstrap-ubuntu.sh | bash
```

如果 GitHub 访问不稳定，可以本地打包上传：

```powershell
tar --exclude=.git --exclude=data --exclude=logs -czf C:\tmp\workdata_codex0002.tar.gz .
scp C:\tmp\workdata_codex0002.tar.gz root@123.56.100.146:/tmp/workdata_codex0002.tar.gz
Get-Content .\deploy\install-uploaded-ubuntu.sh -Raw | ssh root@123.56.100.146 "bash -s"
```

## 更新和回滚

服务器上更新到最新 GitHub 版本：

```bash
bash /opt/workdata_codex0002/current/deploy/update.sh
```

回滚到上一个 release：

```bash
bash /opt/workdata_codex0002/current/deploy/rollback.sh
```

服务状态：

```bash
systemctl status workdata_codex0002 --no-pager --full
journalctl -u workdata_codex0002 -f
```

健康检查：

```bash
curl http://127.0.0.1:5062/health
```

## Docker 化铺垫

应用代码不依赖宿主机固定路径，运行时依赖都来自环境变量：

- `PORT`
- `HOST`
- `DATA_DIR`
- `LOG_DIR`
- `SESSION_COOKIE_NAME`

后续 Docker 化时，可以直接把 `DATA_DIR` 和 `LOG_DIR` 挂载为 volume，把 `PORT` 暴露出来。
