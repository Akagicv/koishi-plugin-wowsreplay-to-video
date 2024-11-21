import { Context, Schema, h } from 'koishi';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'node:os';

export interface Config {
  pythonPath: string;
  replayMessages: string[];
}

export const Config: Schema<Config> = Schema.object({
  pythonPath: Schema.string().default('D:/wows/renderer/venv/Scripts/python.exe').description('Python 执行路径'),
  replayMessages: Schema.array(Schema.string()).default([
    '这把是不是你打得有问题？',
    '你潜艇觉得是我的锅，那就是我的锅。',
    '你AP打断别人的占点呀，我阐释你的梦',
    '他都已经玩潜艇了，你为什么不顺从他呢？',
  ]).description('复盘时的随机评论句子'),
});

export const name = 'koishi-plugin-wowsreplay-to-video';

export const inject = {
  required: ['http'],
};

export function apply(ctx: Context, config: Config) {
  const TMP_DIR = tmpdir();

  ctx.command('replay <fileUrl>', '上传 wowsreplay 文件链接生成视频')
    .alias('复盘')
    .action(async ({ session }, fileUrl) => {
      if (!fileUrl) return '请提供一个文件链接！可以使用wowsreplay.mihoyo.su上传.wowsreplay文件，然后将生成的链接发送至此';
      if (!fileUrl.endsWith('.wowsreplay')) return '请提供后缀为 .wowsreplay 的文件链接！';

      const fileName = path.basename(fileUrl);
      const tempDir = path.resolve(__dirname, '../uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const replayPath = path.join(tempDir, fileName);
      const mp4Path = replayPath.replace('.wowsreplay', '.mp4');

      const pythonPath = config.pythonPath;

      if (!pythonPath) {
        return 'Python 路径未配置，请在后台设置。';
      }

      try {
        // 异步下载文件
        await downloadFile(fileUrl, replayPath);

        // 执行 Python 渲染脚本
        await runPythonScript(pythonPath, replayPath);

        if (!fs.existsSync(mp4Path)) {
          return '视频生成失败，请检查脚本逻辑或环境配置。';
        }

        const video_temp = fs.readFileSync(mp4Path);		
		const randomMessage = getRandomMessage(config.replayMessages);
		session.send(randomMessage)
        return h.video(video_temp, 'video/mp4')

      } finally {
        // 清理临时文件
        if (fs.existsSync(replayPath)) fs.unlinkSync(replayPath);
        if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
      }
    });
}

function getRandomMessage(messages: string[]): string {
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

// 异步执行 Python 渲染脚本
function runPythonScript(pythonPath: string, replayPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = `${pythonPath} -m render --replay "${replayPath}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('执行出错：', stderr);
        return reject(error.message);
      }
      resolve();
    });
  });
}

// 异步下载文件
async function downloadFile(url: string, dest: string) {
  const fs = require('fs');
  const http = require('http');
  const https = require('https');
  const protocol = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    protocol.get(url, (response: any) => {
      if (response.statusCode !== 200) {
        reject(`下载失败，状态码：${response.statusCode}`);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err: any) => {
      fs.unlink(dest, () => reject(err.message));
    });
  });
}
