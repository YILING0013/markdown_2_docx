-- mermaid_filter.lua

--[[
  当 Pandoc 处理 Markdown 时，如检测到 CodeBlock 的 classes 含 "mermaid"/"sequence"/"flowchart"，
  则调用 mermaid-cli 生成对应 PNG 图片，并把该 CodeBlock 替换为嵌入图片。
--]]

function CodeBlock(block)
    for _, class in pairs(block.classes) do
        if class == 'mermaid' or class == 'sequence' or class == 'flowchart' then
            -- 生成一个随机文件名，避免多用户/多并发时冲突
            local os = require 'os'
            math.randomseed(os.time())
            local r = math.random(1000000000)
            local input_file  = 'temp_' .. r .. '.mmd'
            local output_file = 'temp_' .. r .. '.png'

            -- 将 mermaid 代码写入临时 .mmd
            local f = io.open(input_file, 'w')
            f:write(block.text)
            f:close()

            -- 调用 mermaid-cli (mmdc) 生成 PNG
            os.execute('mmdc -i ' .. input_file .. ' -o ' .. output_file)

            -- 删除临时 .mmd
            os.remove(input_file)

            -- 用一段包含图片的段落替换原代码块
            return pandoc.Para({
                pandoc.Image({ pandoc.Str("diagram") }, output_file)
            })
        end
    end
end
