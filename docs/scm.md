# SCM集成边界

当前UploadAdapter约定kind及upload(blob, signal) → Promise<string>。LocalUploadAdapter调用本地上传API。MockScmAdapter显式标记为mock，委托本地适配器返回可读取HTTP图片地址，不声称SCM已成功接入。

真实接入前必须获得：

1. 测试和生产API地址、网络策略。
2. 鉴权方式、密钥安全配置、签名算法和过期规则。
3. 文件字段、文件名、素材名称及其他必填参数。
4. PNG/JPEG支持、最大字节数、尺寸限制。
5. 响应中素材ID和URL字段、错误结构、是否异步处理。
6. 限流、超时、幂等键和重复请求查询方式。
7. 素材URL访问权限、有效期及删除策略。

专用ScmAdapter应在服务端实现鉴权，并通过实际文档编写契约测试，浏览器不得持有真实密钥。任务缓存已支持上传失败单独重试；真实SCM的幂等语义尚不可假设。当前实现不会发送短信。
