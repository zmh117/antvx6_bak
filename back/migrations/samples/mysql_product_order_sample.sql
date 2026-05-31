CREATE DATABASE IF NOT EXISTS antvx6_business DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE antvx6_business;

CREATE TABLE customers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '客户主键',
    customer_no VARCHAR(64) NOT NULL UNIQUE COMMENT '客户编号',
    name VARCHAR(128) NOT NULL COMMENT '客户名称',
    phone VARCHAR(32) COMMENT '联系电话',
    email VARCHAR(128) COMMENT '电子邮箱',
    status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '客户状态',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) COMMENT='客户表';

CREATE TABLE product_categories (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '分类主键',
    parent_id BIGINT COMMENT '父分类 ID',
    name VARCHAR(128) NOT NULL COMMENT '分类名称',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '展示排序'
) COMMENT='商品分类表';

CREATE TABLE products (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '商品主键',
    category_id BIGINT NOT NULL COMMENT '所属分类 ID',
    sku VARCHAR(64) NOT NULL UNIQUE COMMENT '商品 SKU',
    name VARCHAR(160) NOT NULL COMMENT '商品名称',
    price DECIMAL(12,2) NOT NULL COMMENT '销售价格',
    stock_qty INT NOT NULL DEFAULT 0 COMMENT '库存数量',
    status VARCHAR(32) NOT NULL DEFAULT 'on_sale' COMMENT '商品状态'
) COMMENT='商品表';

CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '订单主键',
    order_no VARCHAR(64) NOT NULL UNIQUE COMMENT '订单编号',
    customer_id BIGINT NOT NULL COMMENT '下单客户 ID',
    total_amount DECIMAL(12,2) NOT NULL COMMENT '订单总金额',
    order_status VARCHAR(32) NOT NULL COMMENT '订单状态',
    ordered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间'
) COMMENT='订单表';

CREATE TABLE order_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '订单明细主键',
    order_id BIGINT NOT NULL COMMENT '订单 ID',
    product_id BIGINT NOT NULL COMMENT '商品 ID',
    quantity INT NOT NULL COMMENT '购买数量',
    unit_price DECIMAL(12,2) NOT NULL COMMENT '成交单价',
    line_amount DECIMAL(12,2) NOT NULL COMMENT '明细金额'
) COMMENT='订单明细表';

CREATE TABLE payments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '支付主键',
    payment_no VARCHAR(64) NOT NULL UNIQUE COMMENT '支付流水号',
    order_id BIGINT NOT NULL COMMENT '订单 ID',
    pay_channel VARCHAR(32) NOT NULL COMMENT '支付渠道',
    pay_amount DECIMAL(12,2) NOT NULL COMMENT '支付金额',
    pay_status VARCHAR(32) NOT NULL COMMENT '支付状态',
    paid_at DATETIME COMMENT '支付完成时间'
) COMMENT='支付记录表';
