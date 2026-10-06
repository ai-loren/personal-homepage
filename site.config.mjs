// 仅在生成公开产物时读取；修改后必须重新构建、重启预览或重新部署。
// 'all'：发布 content.js experience 里的全部公司，并显示切换菜单；
// 填某一家公司的 id：只发布这一家并锁定菜单，其余公司的信息若出现在任何公开文件里，构建直接报错。
export const CAREER_VISIBILITY = 'tencent';
