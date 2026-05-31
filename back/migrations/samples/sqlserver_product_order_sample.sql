CREATE TABLE customers (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    customer_no NVARCHAR(64) NOT NULL UNIQUE,
    name NVARCHAR(128) NOT NULL,
    phone NVARCHAR(32) NULL,
    email NVARCHAR(128) NULL,
    status NVARCHAR(32) NOT NULL DEFAULT 'active',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
EXEC sp_addextendedproperty 'MS_Description', N'客户表', 'SCHEMA', 'dbo', 'TABLE', 'customers';
EXEC sp_addextendedproperty 'MS_Description', N'客户主键', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'客户编号', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'customer_no';
EXEC sp_addextendedproperty 'MS_Description', N'客户名称', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'name';
EXEC sp_addextendedproperty 'MS_Description', N'联系电话', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'phone';
EXEC sp_addextendedproperty 'MS_Description', N'电子邮箱', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'email';
EXEC sp_addextendedproperty 'MS_Description', N'客户状态', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'status';
EXEC sp_addextendedproperty 'MS_Description', N'创建时间', 'SCHEMA', 'dbo', 'TABLE', 'customers', 'COLUMN', 'created_at';

CREATE TABLE product_categories (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    parent_id BIGINT NULL,
    name NVARCHAR(128) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);
EXEC sp_addextendedproperty 'MS_Description', N'商品分类表', 'SCHEMA', 'dbo', 'TABLE', 'product_categories';
EXEC sp_addextendedproperty 'MS_Description', N'分类主键', 'SCHEMA', 'dbo', 'TABLE', 'product_categories', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'父分类 ID', 'SCHEMA', 'dbo', 'TABLE', 'product_categories', 'COLUMN', 'parent_id';
EXEC sp_addextendedproperty 'MS_Description', N'分类名称', 'SCHEMA', 'dbo', 'TABLE', 'product_categories', 'COLUMN', 'name';
EXEC sp_addextendedproperty 'MS_Description', N'展示排序', 'SCHEMA', 'dbo', 'TABLE', 'product_categories', 'COLUMN', 'sort_order';

CREATE TABLE products (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    category_id BIGINT NOT NULL,
    sku NVARCHAR(64) NOT NULL UNIQUE,
    name NVARCHAR(160) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    stock_qty INT NOT NULL DEFAULT 0,
    status NVARCHAR(32) NOT NULL DEFAULT 'on_sale'
);
EXEC sp_addextendedproperty 'MS_Description', N'商品表', 'SCHEMA', 'dbo', 'TABLE', 'products';
EXEC sp_addextendedproperty 'MS_Description', N'商品主键', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'所属分类 ID', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'category_id';
EXEC sp_addextendedproperty 'MS_Description', N'商品 SKU', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'sku';
EXEC sp_addextendedproperty 'MS_Description', N'商品名称', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'name';
EXEC sp_addextendedproperty 'MS_Description', N'销售价格', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'price';
EXEC sp_addextendedproperty 'MS_Description', N'库存数量', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'stock_qty';
EXEC sp_addextendedproperty 'MS_Description', N'商品状态', 'SCHEMA', 'dbo', 'TABLE', 'products', 'COLUMN', 'status';

CREATE TABLE orders (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_no NVARCHAR(64) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    order_status NVARCHAR(32) NOT NULL,
    ordered_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
EXEC sp_addextendedproperty 'MS_Description', N'订单表', 'SCHEMA', 'dbo', 'TABLE', 'orders';
EXEC sp_addextendedproperty 'MS_Description', N'订单主键', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'订单编号', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'order_no';
EXEC sp_addextendedproperty 'MS_Description', N'下单客户 ID', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'customer_id';
EXEC sp_addextendedproperty 'MS_Description', N'订单总金额', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'total_amount';
EXEC sp_addextendedproperty 'MS_Description', N'订单状态', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'order_status';
EXEC sp_addextendedproperty 'MS_Description', N'下单时间', 'SCHEMA', 'dbo', 'TABLE', 'orders', 'COLUMN', 'ordered_at';

CREATE TABLE order_items (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_amount DECIMAL(12,2) NOT NULL
);
EXEC sp_addextendedproperty 'MS_Description', N'订单明细表', 'SCHEMA', 'dbo', 'TABLE', 'order_items';
EXEC sp_addextendedproperty 'MS_Description', N'订单明细主键', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'订单 ID', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'order_id';
EXEC sp_addextendedproperty 'MS_Description', N'商品 ID', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'product_id';
EXEC sp_addextendedproperty 'MS_Description', N'购买数量', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'quantity';
EXEC sp_addextendedproperty 'MS_Description', N'成交单价', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'unit_price';
EXEC sp_addextendedproperty 'MS_Description', N'明细金额', 'SCHEMA', 'dbo', 'TABLE', 'order_items', 'COLUMN', 'line_amount';

CREATE TABLE payments (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    payment_no NVARCHAR(64) NOT NULL UNIQUE,
    order_id BIGINT NOT NULL,
    pay_channel NVARCHAR(32) NOT NULL,
    pay_amount DECIMAL(12,2) NOT NULL,
    pay_status NVARCHAR(32) NOT NULL,
    paid_at DATETIME2 NULL
);
EXEC sp_addextendedproperty 'MS_Description', N'支付记录表', 'SCHEMA', 'dbo', 'TABLE', 'payments';
EXEC sp_addextendedproperty 'MS_Description', N'支付主键', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'id';
EXEC sp_addextendedproperty 'MS_Description', N'支付流水号', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'payment_no';
EXEC sp_addextendedproperty 'MS_Description', N'订单 ID', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'order_id';
EXEC sp_addextendedproperty 'MS_Description', N'支付渠道', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'pay_channel';
EXEC sp_addextendedproperty 'MS_Description', N'支付金额', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'pay_amount';
EXEC sp_addextendedproperty 'MS_Description', N'支付状态', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'pay_status';
EXEC sp_addextendedproperty 'MS_Description', N'支付完成时间', 'SCHEMA', 'dbo', 'TABLE', 'payments', 'COLUMN', 'paid_at';
