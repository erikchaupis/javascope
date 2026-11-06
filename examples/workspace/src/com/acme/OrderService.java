package com.acme;

import java.util.ArrayList;
import java.util.List;

/**
 * Sample service used by the JavaScope demo workspace.
 */
public class OrderService {
	private static final int MAX_ORDERS = 100;
	private final List<String> orders = new ArrayList<>();

	public void addOrder(String order) {
		System.out.println(MAX_ORDERS);
		if (order == null || order.isEmpty()) {
			throw new IllegalArgumentException("order must not be blank");
		}
		orders.add(order);
	}

	public int count() {
		return orders.size();
	}
}
