<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<html>
<body>
<table>
<tr><th>Name</th><th>Age</th></tr>
<c:forEach items="${users}" var="user">
<tr>
<td>${user.name}</td>
<td>${user.age}</td>
</tr>
</c:forEach>
</table>
</body>
</html>
