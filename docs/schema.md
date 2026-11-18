# 字典与图谱数据结构

## 文件

`examples/math-taxonomy.json` 是可读的示例分类字典，顶层含 `taxonomy_version`、`scope` 和 `tables`。`tables` 按 D1、D2、D3、D4、D6 分组，各组以正式标签 ID 为键。

`examples/math-graph.json` 是页面使用的紧凑表示，以相同 ID 为键、数组为值。`examples/math-nodes.csv` 为方便筛选的节点总表，不替代 JSON 中完整的取值规则和关系字段。本仓库只收录数学示例，不提供完整字典或完整 Excel。

## 示例字典字段

| 层级 | 字段 |
| --- | --- |
| 公共 | `tag_id`、`tag_name` |
| D1 | `entry_type`、`stage`、`stage_ids`，部分条目有 `definition` |
| D2 | `entrance_id`、`stages`、`organization`、`definition`、`examples` |
| D3 | `entrance_id`、`stages`、`allowed_D2_ids`、`group`、`definition` |
| D4 | `entrance_id`、`stages`、`knowledge_domains`、`related_D3_ids`、`knowledge_type`、`prerequisite_ids`、`related_D4_ids` |
| D6 | `facet`、`parent_id`、`value_rule`、`criterion`、`example`、`combination` |

可选字段不存在、空数组和空字符串均保留原始语义。空关联表示当前未维护，不能直接解释为不存在知识联系。

## 图谱数组位置

| 层级 | 从索引 0 开始的字段顺序 |
| --- | --- |
| D1 | 层级、名称、入口类型、学段 ID 数组、范围说明、分类说明 |
| D2 | 层级、名称、D1 入口 ID、学段名称数组、组织方式、分类说明、示例 |
| D3 | 层级、名称、D1 入口 ID、学段名称数组、允许的 D2 ID 数组、分组、分类说明 |
| D4 | 层级、名称、D1 入口 ID、学段名称数组、知识域数组、关联 D3 ID 数组、知识类型、前置 D4 ID 数组、关联 D4 ID 数组 |
| D6 | 层级、名称、属性维度、父级 ID、取值规则、判断标准、示例、组合规则 |

## 关系规则

D3 允许存在多个 D2 父级，图谱全览只绘制该 ID 一次。D4 按知识域组织，仅沿 `related_D3_ids` 等现有字段提供关联查看。D6 是针对题目和作答的独立属性集合，具有自己的父子细分关系。

D6 的计数标签还需要具体数值，字典中保留对应 `value_rule`。真实标注还需维护小问 ID、作答部分 ID 等实例信息，它们不属于这个静态分类目录。

## 使用边界

分类字典可用于标签检索、数据结构设计和人工维护。字典文件本身不是图片分类模型，也不是已经验收的训练集。跨年级覆盖、知识点粒度和语义映射仍需结合实际课程与样本检验。
