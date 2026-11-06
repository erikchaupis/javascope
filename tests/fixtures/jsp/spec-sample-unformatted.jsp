<%@ page language="java" contentType="text/html" %>

<html>
<head>
<title>${pageTitle}</title>
</head>
<body>
<c:forEach items="${users}" var="user">
<p>${user.name}</p>
</c:forEach>
<%
String message = "Hello";
%>
</body>
</html>
