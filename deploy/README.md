# 部署说明

默认参数：

- 服务名：`workdata_codex0002`
- 访问端口：`5062`
- 应用根目录：`/opt/workdata_codex0002`
- 数据目录：`/var/lib/workdata_codex0002`
- 日志目录：`/var/log/workdata_codex0002`

首次安装：

```bash
curl -fsSL https://raw.githubusercontent.com/peter-zx/workdata_codex0002/main/deploy/bootstrap-ubuntu.sh | bash
```

本地包安装：

```bash
ARCHIVE_PATH=/tmp/workdata_codex0002.tar.gz bash install-uploaded-ubuntu.sh
```

更新：

```bash
bash /opt/workdata_codex0002/current/deploy/update.sh
```

回滚：

```bash
bash /opt/workdata_codex0002/current/deploy/rollback.sh
```
