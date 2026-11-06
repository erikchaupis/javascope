package com.acme;

import java.util.*;

public class OrderServiceUnformatted{private static final int MAX=100;private List<String> orders=new ArrayList<>();
public void add(String o){if(o==null||o.isEmpty()){throw new IllegalArgumentException("blank");}orders.add(o);}
public int count(){return orders.size();}}
