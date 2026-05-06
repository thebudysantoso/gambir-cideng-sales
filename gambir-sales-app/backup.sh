#!/bin/bash
# Backup script for gambir-sales-app — auto-save all critical files
BACKUP_DIR="$(dirname "$0")/BACKUP_$(date +%Y-%m-%d-%H%M)"
mkdir -p "$BACKUP_DIR"
cp "$(dirname "$0")/server/index.js" "$BACKUP_DIR/"
cp "$(dirname "$0")/server/clusters.js" "$BACKUP_DIR/"
cp "$(dirname "$0")/server/sheets.js" "$BACKUP_DIR/" 2>/dev/null
cp "$(dirname "$0")/public/index.html" "$BACKUP_DIR/"
cp "$(dirname "$0")/public/app.js" "$BACKUP_DIR/"
cp "$(dirname "$0")/public/style.css" "$BACKUP_DIR/" 2>/dev/null
cp "$(dirname "$0")/public/visit.html" "$BACKUP_DIR/" 2>/dev/null
cp "$(dirname "$0")/data/gambir_sales.db" "$BACKUP_DIR/" 2>/dev/null
cp "$(dirname "$0")/package.json" "$BACKUP_DIR/"
cp "$(dirname "$0")/server.log" "$BACKUP_DIR/" 2>/dev/null
ls -la "$BACKUP_DIR" > "$BACKUP_DIR/FILE_LIST.txt"
echo "Backup saved to: $BACKUP_DIR"
