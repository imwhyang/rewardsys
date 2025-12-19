/**
 * 文件: scripts/build.js
 * 描述: 简易构建脚本，将静态站点资源拷贝到 dist 目录，保持原有目录结构。
 * 说明: 本项目为纯静态（HTML/CSS/JS），不涉及打包与编译，此脚本仅做复制。
 */
import fs from 'fs';
import path from 'path';

/**
 * 函数: ensureDir
 * 作用: 确保目录存在（不存在则创建）
 * @param {string} dir 目标目录路径
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 函数: copyFile
 * 作用: 复制单个文件到目标位置（自动创建目标目录）
 * @param {string} src 源文件路径
 * @param {string} dest 目标文件路径
 */
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log('Copied:', path.relative(process.cwd(), src), '->', path.relative(process.cwd(), dest));
}

/**
 * 函数: copyDir
 * 作用: 递归复制目录（仅复制文件与子目录）
 * @param {string} srcDir 源目录
 * @param {string} destDir 目标目录
 * @param {(name:string)=>boolean} [filter] 过滤器，返回 true 则复制
 */
function copyDir(srcDir, destDir, filter = () => true) {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (!filter(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, filter);
    } else if (entry.isFile()) {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * 函数: cleanDir
 * 作用: 清空并重建目录
 * @param {string} dir 目录路径
 */
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// 构建入口
const root = process.cwd();
const dist = path.join(root, 'dist');

console.log('Building to:', dist);
cleanDir(dist);

// 复制根级静态文件
const rootFiles = [
  'index.html',
  'daily.html',
  'styles.css',
  'main.js',
  'daily.js',
  'sw.js',
  '_redirects'
];
for (const f of rootFiles) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    copyFile(src, path.join(dist, f));
  }
}

// 复制子目录
const subDirs = ['lib', 'tabs'];
for (const d of subDirs) {
  const srcDir = path.join(root, d);
  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, path.join(dist, d));
  }
}

console.log('Build completed.');
