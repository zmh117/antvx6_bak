## Agent Context Example

```json
{
  "businessFlowContext": {
    "businessFlows": [
      {
        "code": "order_create",
        "steps": [
          {
            "stepKey": "task_submit_order",
            "title": "提交订单",
            "bpmn": { "elementType": "TASK", "taskType": "NONE" },
            "taskUi": {
              "page": {
                "pageName": "订单创建页",
                "routePattern": "/orders/create",
                "moduleName": "订单"
              },
              "uiSteps": [
                {
                  "id": "step_quantity",
                  "stepNo": 1,
                  "elementType": "Input",
                  "elementName": "数量",
                  "actionType": "input",
                  "value": "2",
                  "businessMeaning": "录入采购数量",
                  "expectedResult": "数量字段显示 2",
                  "negativeTestHints": ["数量为空", "数量为 0"]
                },
                {
                  "id": "step_assert_table",
                  "stepNo": 2,
                  "elementType": "DataTable",
                  "elementName": "订单列表",
                  "actionType": "assertData",
                  "expectedResult": "列表出现新订单"
                }
              ],
              "expectedResults": ["订单创建成功"],
              "assertions": ["订单列表出现新订单"]
            },
            "containerNodeKey": "container_checkout"
          }
        ],
        "containers": [
          {
            "containerKey": "container_checkout",
            "title": "结算流程",
            "containerMode": "embedded",
            "calledProcessRef": null,
            "calledProcessVersion": null,
            "childStepKeys": ["task_submit_order"]
          }
        ],
        "edges": [
          {
            "edgeKey": "edge_enter_checkout",
            "sourceStepKey": "task_cart",
            "targetStepKey": "task_submit_order",
            "edgeScope": "crossContainerBoundary"
          }
        ],
        "qualityIssues": []
      }
    ]
  }
}
```
